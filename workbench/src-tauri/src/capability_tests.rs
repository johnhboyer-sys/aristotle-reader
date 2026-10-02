// The window's file access as it really is: fs commands sent through Tauri's
// IPC, against the app's own compiled capability (generate_context! resolves
// capabilities/default.json with the fs plugin's permission sets), checked the
// way the fs plugin checks them. Reading the JSON and reasoning about it would
// miss what a permission set brings in with it — `fs:allow-appdata-*` adds
// $RESOURCE, `fs:default` adds every app folder — which is the mistake
// workbench-design/sandboxing-plan.md ("Codex review of phase 1") warns of.
//
// Each test gets its own app identifier, so $APPDATA is a fresh folder and the
// user's real app data is never touched.

use std::path::{Path, PathBuf};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewWindow};
use tauri_plugin_fs::FsExt;

struct TestApp {
    app: App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
    appdata: PathBuf,
}

/// The app with its real capability and its real fs plugins, under `id`.
fn app(id: &str) -> TestApp {
    let mut ctx = tauri::generate_context!(test = true);
    ctx.config_mut().identifier = format!("org.aristotlereader.workbench.test-{id}-{}", std::process::id());
    let app = crate::with_fs_plugins(mock_builder()).build(ctx).expect("app builds");
    let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().expect("window");
    let appdata = app.path().app_data_dir().expect("app data dir");
    std::fs::create_dir_all(&appdata).unwrap();
    TestApp { app, window, appdata }
}

/// A fresh folder outside every scope the window is granted.
fn outside(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("wb-cap-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d.canonicalize().unwrap()
}

fn request(cmd: &str, body: InvokeBody, headers: tauri::http::HeaderMap) -> InvokeRequest {
    InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body,
        headers,
        invoke_key: INVOKE_KEY.to_string(),
    }
}

impl TestApp {
    fn call(&self, cmd: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
        get_ipc_response(&self.window, request(&format!("plugin:fs|{cmd}"), InvokeBody::Json(args), Default::default()))
            .map(|b| b.deserialize::<serde_json::Value>().unwrap_or_default())
            .map_err(|e| e.to_string())
    }

    /// writeTextFile as the JS API sends it: the path in a header, the bytes as the body.
    fn write_text(&self, path: &Path) -> Result<(), String> {
        let mut headers = tauri::http::HeaderMap::new();
        let encoded = path.display().to_string().replace('%', "%25").replace(' ', "%20");
        headers.insert("path", encoded.parse().unwrap());
        get_ipc_response(&self.window, request("plugin:fs|write_text_file", InvokeBody::Raw(b"probe".to_vec()), headers))
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

impl Drop for TestApp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.appdata);
    }
}

fn p(path: &Path) -> serde_json::Value {
    serde_json::Value::String(path.display().to_string())
}

#[test]
fn the_window_writes_app_data() {
    // The positive control: without it, a capability that allowed nothing
    // would pass every refusal below.
    let t = app("writes");
    let file = t.appdata.join("settings.json.1.tmp");
    t.write_text(&file).expect("write in app data");
    t.call("rename", serde_json::json!({ "oldPath": p(&file), "newPath": p(&t.appdata.join("settings.json")) }))
        .expect("rename in app data");
    t.call("mkdir", serde_json::json!({ "path": p(&t.appdata.join("library/physica")), "options": { "recursive": true } }))
        .expect("mkdir in app data");
    t.write_text(&t.appdata.join("library/physica/b01c01.md")).expect("write two levels down");
    assert_eq!(t.call("exists", serde_json::json!({ "path": p(&t.appdata.join("settings.json")) })), Ok(true.into()));
    t.call("remove", serde_json::json!({ "path": p(&t.appdata.join("library/physica")), "options": { "recursive": true } }))
        .expect("remove in app data");
}

#[test]
fn the_window_cannot_write_outside_app_data() {
    let t = app("refuses");
    let out = outside("refuses");
    let victim = out.join("victim.txt");
    std::fs::write(&victim, "untouched").unwrap();

    assert!(t.write_text(&out.join("new.txt")).is_err(), "write_text_file outside app data");
    assert!(t.write_text(&victim).is_err(), "overwrite outside app data");
    let refused = |cmd: &str, args: serde_json::Value| {
        let r = t.call(cmd, args.clone());
        assert!(r.is_err(), "{cmd} {args} was allowed: {r:?}");
    };
    refused("write_file", serde_json::json!({ "path": p(&victim) }));
    refused("mkdir", serde_json::json!({ "path": p(&out.join("d")) }));
    refused("create", serde_json::json!({ "path": p(&out.join("c.txt")) }));
    refused("remove", serde_json::json!({ "path": p(&victim) }));
    refused("truncate", serde_json::json!({ "path": p(&victim), "len": 0 }));
    refused("rename", serde_json::json!({ "oldPath": p(&victim), "newPath": p(&out.join("moved.txt")) }));
    refused("copy_file", serde_json::json!({ "fromPath": p(&t.appdata.join("x")), "toPath": p(&out.join("copy.txt")) }));
    // open can take write options from the window, so it is a write command.
    refused("open", serde_json::json!({ "path": p(&victim), "options": { "write": true } }));
    assert_eq!(std::fs::read_to_string(&victim).unwrap(), "untouched");
    assert!(!out.join("new.txt").exists() && !out.join("d").exists() && !out.join("c.txt").exists());
}

#[test]
fn the_window_cannot_write_the_installed_app() {
    // $RESOURCE is readable (bundled corpus, reference.docx) but never writable:
    // pandoc and Diogenes run from beside it.
    let t = app("resource");
    let resource = t.app.path().resource_dir().expect("resource dir");
    std::fs::create_dir_all(&resource).unwrap();
    let probe = resource.join(format!("wb-cap-probe-{}.txt", std::process::id()));
    std::fs::write(&probe, "bundled").unwrap();

    assert_eq!(t.call("read_text_file", serde_json::json!({ "path": p(&probe) })).map(|_| ()), Ok(()), "read $RESOURCE");
    assert!(t.write_text(&probe).is_err(), "write in $RESOURCE");
    assert!(t.call("open", serde_json::json!({ "path": p(&probe), "options": { "write": true } })).is_err(), "open-for-write in $RESOURCE");
    assert!(t.call("remove", serde_json::json!({ "path": p(&probe) })).is_err(), "remove in $RESOURCE");
    assert!(t.call("mkdir", serde_json::json!({ "path": p(&resource.join("wb-cap-dir")) })).is_err(), "mkdir in $RESOURCE");
    assert_eq!(std::fs::read_to_string(&probe).unwrap(), "bundled");
    let _ = std::fs::remove_file(&probe);
}

#[test]
fn the_window_cannot_read_what_was_not_picked() {
    let t = app("reads");
    let out = outside("reads");
    std::fs::write(out.join("secret.txt"), "x").unwrap();
    for cmd in ["read_text_file", "read_file", "exists", "stat", "read_dir", "open"] {
        let path = if cmd == "read_dir" { out.clone() } else { out.join("secret.txt") };
        assert!(t.call(cmd, serde_json::json!({ "path": p(&path) })).is_err(), "{cmd} outside the scope");
    }
}

#[test]
#[cfg(unix)]
fn the_window_cannot_write_rusts_dotfiles() {
    let t = app("dotfiles");
    assert!(t.write_text(&t.appdata.join(crate::sandbox::APPROVED_PROGRAMS_FILE)).is_err());
    assert!(t.write_text(&t.appdata.join(".persisted-scope")).is_err());
    // Nor remove them — one at a time, or by removing $APPDATA itself.
    let record = t.appdata.join(crate::sandbox::APPROVED_PROGRAMS_FILE);
    std::fs::write(&record, "{}").unwrap();
    assert!(t.call("remove", serde_json::json!({ "path": p(&record) })).is_err());
    assert!(t.call("remove", serde_json::json!({ "path": p(&t.appdata), "options": { "recursive": true } })).is_err());
    assert!(t.call("rename", serde_json::json!({ "oldPath": p(&t.appdata), "newPath": p(&t.appdata.join("moved")) })).is_err());
    assert!(record.is_file());
}

#[test]
fn a_picked_folder_is_open_to_the_window_two_levels_down() {
    // What tauri-plugin-dialog does when the window asks for a folder with
    // `recursive: true` (dialog commands.rs: fs_scope().allow_directory).
    let t = app("pick");
    let library = outside("pick-library");
    let sibling = outside("pick-sibling");
    assert!(t.write_text(&library.join("works.json")).is_err(), "before the pick");
    t.app.fs_scope().allow_directory(&library, true).unwrap();
    t.call("mkdir", serde_json::json!({ "path": p(&library.join("physica")) })).expect("mkdir in the pick");
    t.write_text(&library.join("physica").join("b01c01.md")).expect("write a chapter in the pick");
    t.write_text(&library.join("works.json")).expect("write works.json in the pick");
    assert!(t.write_text(&sibling.join("x.md")).is_err(), "a folder beside the pick");
}

#[test]
fn a_pick_survives_a_restart() {
    let library = outside("restart-library");
    let chapter = library.join("physica").join("b01c01.md");
    let id = "restart";
    {
        let t = app(id);
        t.app.fs_scope().allow_directory(&library, true).unwrap();
        std::mem::forget(t); // keep $APPDATA (and .persisted-scope) for the next launch
    }
    let t = app(id);
    assert!(t.app.fs_scope().is_allowed(&chapter), "the pick came back");
    t.call("mkdir", serde_json::json!({ "path": p(&library.join("physica")) })).expect("mkdir after restart");
    t.write_text(&chapter).expect("save a chapter after restart");
    // And it is the record that brought it back: an unrelated folder is not allowed.
    assert!(!t.app.fs_scope().is_allowed(outside("restart-other").join("x")));
}

#[test]
fn a_lost_scope_record_allows_nothing() {
    // The window can delete .persisted-scope by removing $APPDATA; a missing
    // or garbled record must leave picks closed, not open.
    let library = outside("lost-library");
    let id = "lost";
    {
        let t = app(id);
        t.app.fs_scope().allow_directory(&library, true).unwrap();
        std::fs::write(t.appdata.join(".persisted-scope"), b"garbage").unwrap();
        std::mem::forget(t);
    }
    let t = app(id);
    assert!(!t.app.fs_scope().is_allowed(library.join("works.json")));
    assert!(t.write_text(&library.join("works.json")).is_err());
}
