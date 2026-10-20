//! A short description of a player's device, from the browser's User-Agent.

/// e.g. "Galaxy S23" + "Chrome", "iPhone" + "Safari".
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DeviceSummary {
    pub device: String,
    pub browser: String,
}

impl std::fmt::Display for DeviceSummary {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} · {}", self.device, self.browser)
    }
}

/// Best-effort summary; unknown parts become generic names.
pub fn summarize(user_agent: &str) -> DeviceSummary {
    let ua = user_agent;
    let browser = if ua.contains("Edg/") || ua.contains("EdgA/") || ua.contains("EdgiOS/") {
        "Edge"
    } else if ua.contains("SamsungBrowser/") {
        "Samsung Internet"
    } else if ua.contains("Firefox/") || ua.contains("FxiOS/") {
        "Firefox"
    } else if ua.contains("Chrome/") || ua.contains("CriOS/") {
        "Chrome"
    } else if ua.contains("Safari/") {
        "Safari"
    } else {
        "Browser"
    };
    let device = if ua.contains("iPhone") {
        "iPhone".to_owned()
    } else if ua.contains("iPad") || (ua.contains("Macintosh") && ua.contains("Mobile/")) {
        "iPad".to_owned()
    } else if ua.contains("Android") {
        android_model(ua).unwrap_or_else(|| "Android".to_owned())
    } else if ua.contains("Windows") {
        "Windows PC".to_owned()
    } else if ua.contains("Macintosh") {
        "Mac".to_owned()
    } else if ua.contains("Linux") {
        "Linux PC".to_owned()
    } else {
        "Device".to_owned()
    };
    DeviceSummary {
        device,
        browser: browser.to_owned(),
    }
}

/// The model from "(Linux; Android 14; SM-S911B) …"; recent Chrome reports only "K".
fn android_model(ua: &str) -> Option<String> {
    let inside = ua.split_once('(')?.1.split_once(')')?.0;
    let model = inside.split(';').map(str::trim).find(|p| {
        !p.is_empty()
            && !p.starts_with("Linux")
            && !p.starts_with("Android")
            && *p != "K"
            && *p != "wv"
    })?;
    let model = model.split(" Build/").next().unwrap_or(model);
    Some(model.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn common_browsers() {
        let cases = [
            (
                "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
                "SM-S911B",
                "Chrome",
            ),
            (
                "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
                "Android",
                "Chrome",
            ),
            (
                "Mozilla/5.0 (Linux; Android 13; SM-X710 Build/TP1A) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Safari/537.36",
                "SM-X710",
                "Samsung Internet",
            ),
            (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
                "iPhone",
                "Safari",
            ),
            (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
                "iPad",
                "Safari",
            ),
            (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
                "Windows PC",
                "Edge",
            ),
            (
                "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
                "Linux PC",
                "Firefox",
            ),
            ("", "Device", "Browser"),
        ];
        for (ua, device, browser) in cases {
            assert_eq!(
                summarize(ua),
                DeviceSummary {
                    device: device.into(),
                    browser: browser.into()
                },
                "{ua}"
            );
        }
    }
}
