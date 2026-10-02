// The ground the sandbox stands on (workbench-design/sandboxing-plan.md).
//
// The window may write anything under $APPDATA, and settings.json lives there,
// so nothing the sandbox trusts may live in a file the window can write. It
// doesn't have to: on Unix the fs plugin's scope globs require a LITERAL
// leading dot (tauri `scope/fs.rs`, `require_literal_leading_dot` defaults to
// true unless the config overrides it), so `$APPDATA/**` never matches a
// dotfile. Rust keeps its trusted state in dotfiles — the persisted-scope
// plugin's `.persisted-scope`, and the approved-programs list — and the window
// cannot write them. It CAN delete them, by removing `$APPDATA` itself
// recursively (the scope allows the directory), so every trusted record must
// fail closed: missing or unreadable means nothing approved. The tests below
// pin the write half: Tauri's default, and that our config keeps it.

/// Rust's record of programs it found or the user picked. A dotfile so the
/// window's `$APPDATA/**` scope can never write it (see above).
#[allow(dead_code)] // used from phase 2 of the plan
pub const APPROVED_PROGRAMS_FILE: &str = ".approved-programs.json";

#[cfg(test)]
mod tests {
    use super::APPROVED_PROGRAMS_FILE;
    use tauri::utils::config::FsScope;
    use tauri::Manager;

    /// The scope the window gets for app data — the same `$APPDATA/**` glob the
    /// `fs:allow-appdata-*-recursive` permissions grant, with the config left at
    /// its default for the leading-dot rule, as ours is.
    fn appdata_scope() -> (tauri::fs::Scope, std::path::PathBuf) {
        let app = tauri::test::mock_app();
        let scope = FsScope::Scope {
            allow: vec!["$APPDATA/**".into()],
            deny: vec![],
            require_literal_leading_dot: None,
        };
        let appdata = app.path().app_data_dir().expect("app data dir");
        (tauri::fs::Scope::new(&app, &scope).expect("scope"), appdata)
    }

    #[test]
    fn the_window_can_write_ordinary_app_data() {
        let (scope, appdata) = appdata_scope();
        // A positive control: without it, a scope that allowed nothing would
        // pass the dotfile test below for the wrong reason.
        assert!(scope.is_allowed(appdata.join("settings.json")));
        assert!(scope.is_allowed(appdata.join("library").join("physica").join("b01c01.md")));
    }

    #[test]
    #[cfg(unix)]
    fn the_window_cannot_write_rusts_dotfiles() {
        let (scope, appdata) = appdata_scope();
        assert!(!scope.is_allowed(appdata.join(APPROVED_PROGRAMS_FILE)));
        assert!(!scope.is_allowed(appdata.join(".persisted-scope")));
        // Nor a dotfile one level down.
        assert!(!scope.is_allowed(appdata.join("library").join(".anything")));
    }

    /// The rule above holds only while nobody turns it off in tauri.conf.json.
    #[test]
    fn the_config_keeps_the_leading_dot_rule() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
            .expect("tauri.conf.json parses");
        let fs = &conf["plugins"]["fs"];
        assert!(
            fs.get("requireLiteralLeadingDot").is_none() && fs.get("require-literal-leading-dot").is_none(),
            "tauri.conf.json sets the fs leading-dot rule; the sandbox depends on its default (true)"
        );
    }
}
