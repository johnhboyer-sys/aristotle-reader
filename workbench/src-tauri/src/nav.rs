//! Where the window may go. It shows the app and nothing else: a link in AI
//! output (or anywhere else) opens in the system browser, and the window stays
//! on the app. A page the window navigated to would run with every permission
//! the app's capability grants.
//!
//! Every top-level navigation passes [`decide`]. New-window requests
//! (`target="_blank"`, `window.open`) have no handler, so the webview drops
//! them (wry returns no new webview on macOS); the app's own links carry no
//! target (src/lib/assist/markdown.ts), so a click is a navigation and lands
//! here. Dropping a file on the window is a navigation to a file: URL, which
//! is blocked.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::{Manager, Runtime, Url};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, PartialEq, Eq)]
pub enum Nav {
    /// The app itself: let the window load it.
    Stay,
    /// Somewhere outside: open it in the system browser (or mail app) instead.
    Browser,
    /// Anything else (file:, data:, javascript:, …): go nowhere.
    Block,
}

/// What to do with a navigation to `url`. `dev_url` is the dev server the
/// window loads in `tauri dev`; None in a built app.
pub fn decide(url: &Url, dev_url: Option<&Url>) -> Nav {
    match url.scheme() {
        // The built app: tauri://localhost on macOS and Linux,
        // http(s)://tauri.localhost on Windows.
        "tauri" if url.host_str() == Some("localhost") && url.port().is_none() => Nav::Stay,
        "http" | "https" if cfg!(windows) && url.host_str() == Some("tauri.localhost") && url.port().is_none() => {
            Nav::Stay
        }
        "http" | "https" if dev_url.is_some_and(|d| d.origin() == url.origin()) => Nav::Stay,
        "http" | "https" | "mailto" => Nav::Browser,
        _ if url.as_str() == "about:blank" => Nav::Stay,
        _ => Nav::Block,
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("nav-guard")
        .on_navigation(|webview, url| {
            let app = webview.app_handle();
            let dev_url = if tauri::is_dev() { app.config().build.dev_url.clone() } else { None };
            match decide(url, dev_url.as_ref()) {
                Nav::Stay => true,
                Nav::Browser => {
                    if let Err(err) = app.opener().open_url(url.as_str(), None::<&str>) {
                        eprintln!("[nav] could not open {url} in the browser: {err}");
                    }
                    false
                }
                Nav::Block => {
                    eprintln!("[nav] blocked navigation to {url}");
                    false
                }
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(url: &str, dev: Option<&str>) -> Nav {
        let dev = dev.map(|d| Url::parse(d).unwrap());
        decide(&Url::parse(url).unwrap(), dev.as_ref())
    }

    #[test]
    fn the_app_itself_loads() {
        assert_eq!(d("tauri://localhost/", None), Nav::Stay);
        assert_eq!(d("tauri://localhost/index.html#x", None), Nav::Stay);
        // The Windows origin; on macOS and Linux the app is never served there.
        let windows_origin = if cfg!(windows) { Nav::Stay } else { Nav::Browser };
        assert_eq!(d("http://tauri.localhost/", None), windows_origin);
        assert_eq!(d("http://localhost:1421/", Some("http://localhost:1421")), Nav::Stay);
        assert_eq!(d("about:blank", None), Nav::Stay);
    }

    #[test]
    fn an_outside_link_opens_in_the_browser() {
        assert_eq!(d("https://perseus.tufts.edu/hopper/", None), Nav::Browser);
        assert_eq!(d("http://example.com/", None), Nav::Browser);
        assert_eq!(d("mailto:a@b.c", None), Nav::Browser);
        // The dev server's origin is the app only in dev, and only on its port.
        assert_eq!(d("http://localhost:1421/", None), Nav::Browser);
        assert_eq!(d("http://localhost:9999/", Some("http://localhost:1421")), Nav::Browser);
        assert_eq!(d("https://tauri.localhost.evil.com/", None), Nav::Browser);
        // Never another port, which a local server could answer on.
        assert_eq!(d("http://tauri.localhost:8080/", None), Nav::Browser);
    }

    #[test]
    fn anything_else_goes_nowhere() {
        for url in [
            "file:///Users/u/Documents/secret.txt",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "tauri://evil.com/",
            "tauri://localhost:8080/",
            "asset://localhost/x",
            "blob:tauri://localhost/123",
            "ftp://example.com/",
            "about:srcdoc",
        ] {
            assert_eq!(d(url, Some("http://localhost:1421")), Nav::Block, "{url}");
        }
    }
}
