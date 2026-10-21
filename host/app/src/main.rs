//! The Ninjoy desktop app: the window (from `desktop/`), the system tray, starting with the
//! system, a single running copy, and `ninjoy create|remove|kick|list` for the running app.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;

use ninjoy_app_core::{AppCore, CoreConfig, LiveView, Settings, Snapshot, channel, cli};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

type Core = Arc<AppCore>;

#[tauri::command]
fn snapshot(core: State<'_, Core>) -> Snapshot {
    core.snapshot()
}

#[tauri::command]
fn live(core: State<'_, Core>, number: u16) -> Option<LiveView> {
    core.live(number)
}

#[tauri::command]
fn create(core: State<'_, Core>, number: Option<u16>) -> Result<u16, String> {
    core.create(number).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove(core: State<'_, Core>, number: u16) -> Result<(), String> {
    core.remove(number).map_err(|e| e.to_string())
}

#[tauri::command]
fn kick(core: State<'_, Core>, number: u16) -> Result<(), String> {
    core.kick(number).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_settings(app: AppHandle, core: State<'_, Core>, settings: Settings) {
    core.update_settings(settings);
    sync_autostart(&app, &core);
}

#[tauri::command]
fn qr_svg(text: String) -> String {
    ninjoy_app_core::qr_svg(&text)
}

/// Starting with the system follows the setting.
fn sync_autostart(app: &AppHandle, core: &AppCore) {
    let launcher = app.autolaunch();
    let wanted = core.settings().start_with_system;
    let result = match (wanted, launcher.is_enabled().unwrap_or(false)) {
        (true, false) => launcher.enable(),
        (false, true) => launcher.disable(),
        _ => Ok(()),
    };
    if let Err(error) = result {
        tracing::warn!(%error, "could not change starting with the system");
    }
}

/// Shows the window (creating it the first time) and brings it forward.
fn show(app: &AppHandle) {
    let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => match WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
            .title("Ninjoy")
            .inner_size(1280.0, 800.0)
            .min_inner_size(960.0, 620.0)
            .decorations(false)
            .center()
            .build()
        {
            Ok(window) => window,
            Err(error) => {
                tracing::error!(%error, "could not open the window");
                return;
            }
        },
    };
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
}

fn quit(app: &AppHandle) {
    if let Some(core) = app.try_state::<Core>() {
        let core = core.inner().clone();
        tauri::async_runtime::block_on(core.shutdown());
    }
    app.exit(0);
}

/// WebKitGTK's DMA-BUF renderer fails on many Wayland setups (NVIDIA among them) with "Error 71
/// (Protocol error) dispatching to Wayland display" and no window; the older renderer works
/// everywhere. The user's own value wins.
#[cfg(target_os = "linux")]
fn webview_workarounds() {
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        // SAFETY: called first thing in main, before any other thread reads the environment
        unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
    }
}

#[cfg(not(target_os = "linux"))]
fn webview_workarounds() {}

fn main() {
    webview_workarounds();
    let args: Vec<String> = std::env::args().skip(1).collect();
    // `ninjoy create 3` and friends talk to the running app and exit
    if let Some(code) = cli::run(&args) {
        std::process::exit(code);
    }
    // a single copy: if one runs, bring its window forward
    let channel_name = channel::default_name();
    if channel::send(&channel_name, "show").is_ok() {
        return;
    }
    let in_tray = args.iter().any(|a| a == "--tray");

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "ninjoy=info,ninjoy_app_core=info,ninjoy_session=info,ninjoy_devices=info".into()
            }),
        )
        .with_target(false)
        .init();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--tray"]),
        ))
        .invoke_handler(tauri::generate_handler![
            snapshot,
            live,
            create,
            remove,
            kick,
            set_settings,
            qr_svg
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let core = tauri::async_runtime::block_on(AppCore::start(CoreConfig::for_user()))?;
            app.manage(core.clone());
            sync_autostart(&handle, &core);

            // the command line and second starts
            let shown = handle.clone();
            tauri::async_runtime::block_on(async {
                channel::serve(&channel_name, core.clone(), move || {
                    let app = shown.clone();
                    let _ = shown.run_on_main_thread(move || show(&app));
                })
            })?;

            // the window refreshes when anything changes
            let mut changes = core.subscribe();
            let emitter = handle.clone();
            tauri::async_runtime::spawn(async move {
                while changes.recv().await.is_ok() {
                    let _ = emitter.emit("changed", ());
                }
            });

            let open = MenuItem::with_id(app, "open", "Open Ninjoy", true, None::<&str>)?;
            let exit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &exit])?;
            let mut tray = TrayIconBuilder::with_id("ninjoy")
                .tooltip("Ninjoy")
                .menu(&menu)
                .show_menu_on_left_click(false);
            // drawn for the tray's size (sharper than scaling the big window icon down)
            tray = tray.icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/32x32.png"
            ))?);
            tray.on_menu_event(|app, event| match event.id().as_ref() {
                "open" => show(app),
                "quit" => quit(app),
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    show(tray.app_handle());
                }
            })
            .build(app)?;

            if !in_tray {
                show(&handle);
            }
            Ok(())
        })
        // closing the window keeps Ninjoy in the tray
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!());

    match result {
        Ok(app) => app.run(|_, event| {
            // no window open is fine: Ninjoy lives in the tray
            if let tauri::RunEvent::ExitRequested {
                api, code: None, ..
            } = event
            {
                api.prevent_exit();
            }
        }),
        Err(error) => {
            eprintln!("Ninjoy could not start: {error}");
            std::process::exit(1);
        }
    }
}
