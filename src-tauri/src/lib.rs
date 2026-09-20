// `pub fn` exposes `run` to main.rs, which lives in a separate crate target
// (the binary) from this library.
// `cfg_attr(mobile, ...)` applies the attribute only when compiling for mobile targets.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Builder pattern: chain configuration calls, then `.run(...)` starts the app.
    tauri::Builder::default()
        // `generate_context!` embeds tauri.conf.json and the frontend assets at compile time.
        // `.expect(...)` panics with this message if the app fails to start.
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
