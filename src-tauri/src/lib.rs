use std::{sync::Mutex, thread, time::Duration};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    AppHandle, Manager, State, WindowEvent, Wry,
};

/// How long the window may stay hidden if the page never finishes loading.
const SHOW_WINDOW_AFTER: Duration = Duration::from_secs(3);

/// The tray's state, shared between the tray, the window and the `configure_tray`
/// command. The interface sends the setting and the menu text; until it does, the
/// defaults below match the interface's defaults (hide on close, English text).
struct Tray {
    // `Mutex` lets several threads change the flag safely; each access locks it.
    close_to_tray: Mutex<bool>,
    // `MenuItem<Wry>`: a menu item for Tauri's default runtime (Wry). Kept so the
    // command can rename them when the interface language changes.
    show: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// Brings the main window back: restored if minimised, shown, and focused.
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Called by the interface (see `src/lib/tray.ts`) when it starts, when the reader changes
/// "Keep running in the tray when closed", and when the language changes. Tauri turns the
/// interface's `closeToTray`, `showLabel` and `quitLabel` into these snake_case arguments.
// `#[tauri::command]` makes the function callable from the interface with `invoke`.
#[tauri::command]
fn configure_tray(
    // `State<'_, Tray>`: the `Tray` managed by the app; `'_` lets Rust infer its lifetime.
    tray: State<'_, Tray>,
    close_to_tray: bool,
    show_label: String,
    quit_label: String,
) -> Result<(), String> {
    // `?` returns early with the error; `map_err` turns it into a message for the interface.
    *tray
        .close_to_tray
        .lock()
        .map_err(|error| error.to_string())? = close_to_tray;
    tray.show
        .set_text(show_label)
        .map_err(|error| error.to_string())?;
    tray.quit
        .set_text(quit_label)
        .map_err(|error| error.to_string())?;
    Ok(())
}

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
        // `generate_handler!` registers the commands the interface may `invoke`.
        .invoke_handler(tauri::generate_handler![configure_tray])
        // The window starts hidden (see tauri.conf.json) so the reader never sees it blank
        // while the webview starts. It is shown once the page, with its splash, has loaded.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let _ = webview.window().show();
            }
        })
        // Closing the window hides it to the tray unless the reader turned that off, in
        // which case the close goes ahead and, as the only window, quits the app.
        .on_window_event(|window, event| {
            // `if let` runs the block only when the event is a close request.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let hide = window
                    .try_state::<Tray>()
                    .and_then(|tray| tray.close_to_tray.lock().ok().map(|flag| *flag))
                    .unwrap_or(true);
                if hide {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // The tray: icon, tooltip and a two-item menu. "Quit" calls `exit`, which does
            // not go through the close request above, so it always quits.
            // `None::<&str>`: no keyboard shortcut; the type tells Rust what `None` holds.
            let show = MenuItem::with_id(app, "show", "Show BookaLLM", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit BookaLLM", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let icon = app
                .default_window_icon()
                .cloned()
                .ok_or("the app has no window icon")?;
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .tooltip("BookaLLM")
                .menu(&menu)
                // A left click shows the window; the menu opens on a right click.
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main_window(app),
                    "quit" => app.exit(0),
                    // `_` matches anything else; there is nothing else to do.
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
            app.manage(Tray {
                close_to_tray: Mutex::new(true),
                show,
                quit,
            });

            // Safety net: if the page never finishes loading, show the window anyway.
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
