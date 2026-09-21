use std::{thread, time::Duration};

use tauri::{webview::PageLoadEvent, Manager};

/// How long the window may stay hidden if the page never finishes loading.
const SHOW_WINDOW_AFTER: Duration = Duration::from_secs(3);

// `pub fn` exposes `run` to main.rs, which lives in a separate crate target
// (the binary) from this library.
// `cfg_attr(mobile, ...)` applies the attribute only when compiling for mobile targets.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Builder pattern: chain configuration calls, then `.run(...)` starts the app.
    tauri::Builder::default()
        // Lets the frontend open a web page in the user's default browser. What it may open
        // is limited by the `opener:allow-open-url` scope in capabilities/default.json.
        .plugin(tauri_plugin_opener::init())
        // The window starts hidden (see tauri.conf.json) so the reader never sees it blank
        // while the webview starts. It is shown once the page, with its splash, has loaded.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = webview.window().show();
            }
        })
        // Safety net: if the page never finishes loading, show the window anyway.
        .setup(|app| {
            let handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(SHOW_WINDOW_AFTER);
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });
            Ok(())
        })
        // `generate_context!` embeds tauri.conf.json and the frontend assets at compile time.
        // `.expect(...)` panics with this message if the app fails to start.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
