//! HTTP routes: the controller page, its files, and the WebSocket endpoint.

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::Router;
use axum::body::Body;
use axum::extract::{ConnectInfo, Request, State, WebSocketUpgrade};
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use rust_embed::RustEmbed;

use crate::connection;
use crate::net::is_lan;
use crate::shared::Shared;

/// The built controller page (`npm run build --workspace @ninjoy/controller`). Release builds
/// embed it; debug builds read it from disk, so a fresh page build needs no Rust rebuild.
#[derive(RustEmbed)]
#[folder = "../../controller/dist"]
#[allow_missing = true]
struct WebFiles;

#[derive(Clone)]
pub(crate) struct AppState {
    pub shared: Arc<Shared>,
    pub web_root: Option<PathBuf>,
    /// the plain (non-secure) server shows the explanation page on page addresses
    pub plain: bool,
}

pub(crate) fn router(state: AppState) -> Router {
    Router::new()
        .route("/ws", get(websocket))
        .fallback(get(files))
        .layer(middleware::from_fn(lan_only))
        .with_state(state)
}

/// Refuses anything that does not come from the local network.
async fn lan_only(
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    request: Request,
    next: Next,
) -> Response {
    if is_lan(peer.ip()) {
        next.run(request).await
    } else {
        tracing::warn!(%peer, "refused a connection from outside the local network");
        StatusCode::FORBIDDEN.into_response()
    }
}

async fn websocket(
    State(state): State<AppState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let shared = state.shared.clone();
    upgrade.on_upgrade(move |socket| connection::run(shared, socket, user_agent))
}

/// `/` (controller list) and `/<n>` (a controller) are the page; everything else is a file.
fn is_page_path(path: &str) -> bool {
    let rest = path.trim_start_matches('/');
    rest.is_empty() || (rest.len() <= 5 && rest.bytes().all(|b| b.is_ascii_digit()))
}

async fn files(State(state): State<AppState>, uri: Uri) -> Response {
    let path = uri.path();
    let file = if is_page_path(path) {
        let plain_mode = uri
            .query()
            .is_some_and(|q| q.split('&').any(|p| p == "plain"));
        if state.plain && !plain_mode {
            "explain.html"
        } else {
            "index.html"
        }
    } else {
        path.trim_start_matches('/')
    };
    if file.split('/').any(|part| part == ".." || part.is_empty()) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let bytes = match &state.web_root {
        Some(root) => tokio::fs::read(root.join(file)).await.ok(),
        None => WebFiles::get(file).map(|f| f.data.into_owned()),
    };
    let Some(bytes) = bytes else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mime = mime_guess::from_path(file).first_or_octet_stream();
    // hashed assets never change; pages must always be fresh
    let cache = if file.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    let mut response = Response::new(Body::from(bytes));
    let headers = response.headers_mut();
    if let Ok(v) = HeaderValue::from_str(mime.as_ref()) {
        headers.insert(header::CONTENT_TYPE, v);
    }
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    response
}

#[cfg(test)]
mod tests {
    use super::is_page_path;

    #[test]
    fn page_paths() {
        assert!(is_page_path("/"));
        assert!(is_page_path("/3"));
        assert!(is_page_path("/65535"));
        assert!(!is_page_path("/assets/main.js"));
        assert!(!is_page_path("/123456"));
        assert!(!is_page_path("/favicon.ico"));
    }
}
