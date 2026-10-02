// The ground the sandbox stands on (workbench-design/sandboxing-plan.md).
//
// The window may write anything under $APPDATA, and settings.json lives there,
// so nothing the sandbox trusts may live in a file the window can write. It
// doesn't have to: on Unix the fs plugin's scope globs require a LITERAL
// leading dot (tauri `scope/fs.rs`, `require_literal_leading_dot` defaults to
// true unless the config overrides it), so `$APPDATA/**` never matches a
// dotfile. Rust keeps its trusted state in dotfiles — the persisted-scope
// plugin's `.persisted-scope`, and the approved-programs list — and the window
// cannot write them. Since phase 3 it cannot remove them either: remove and
// rename are granted on `$APPDATA/**` only, never `$APPDATA` itself
// (capabilities/default.json; capability_tests.rs proves both through the
// IPC). Every trusted record still fails closed — missing or unreadable means
// nothing approved — in case a later grant reopens that. The tests below pin
// the leading-dot rule itself: Tauri's default, and that our config keeps it.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Rust's record of programs the user picked. A dotfile so the window's
/// `$APPDATA/**` scope can never write it (see above).
pub const APPROVED_PROGRAMS_FILE: &str = ".approved-programs.json";

/// How a custom AI command reads the prompt.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PromptVia {
    Stdin,
    Arg,
}

/// A custom AI command, approved as a whole: program, arguments and prompt
/// channel together, because the arguments decide what the program does.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomAssist {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub prompt_via: PromptVia,
}

/// What the user picked through a native dialog Rust opened itself. Programs
/// Rust finds on its own are found again each time and never recorded.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApprovedPrograms {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pandoc: Option<PathBuf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_assist: Option<CustomAssist>,
}

/// Serializes every read-modify-write of the record.
static RECORD_LOCK: Mutex<()> = Mutex::new(());

/// The record in `dir`. Fails closed: a missing, empty, unreadable or
/// unparsable file, or one naming a relative path, means nothing approved.
pub fn load_approved(dir: &Path) -> ApprovedPrograms {
    let path = dir.join(APPROVED_PROGRAMS_FILE);
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(e) => {
            if e.kind() != std::io::ErrorKind::NotFound {
                eprintln!("[sandbox] cannot read {}: {e} — nothing approved", path.display());
            }
            return ApprovedPrograms::default();
        }
    };
    let record: ApprovedPrograms = match serde_json::from_str(&text) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[sandbox] {} does not parse: {e} — nothing approved", path.display());
            return ApprovedPrograms::default();
        }
    };
    let relative = record.pandoc.as_deref().is_some_and(|p| !p.is_absolute())
        || record.custom_assist.as_ref().is_some_and(|c| !c.program.is_absolute());
    if relative {
        eprintln!("[sandbox] {} names a relative program — nothing approved", path.display());
        return ApprovedPrograms::default();
    }
    record
}

/// Change the record in `dir` and write it back: a temp dotfile renamed into
/// place, so a crash leaves the old record or the new one, never half of one.
pub fn update_approved(dir: &Path, change: impl FnOnce(&mut ApprovedPrograms)) -> std::io::Result<ApprovedPrograms> {
    let _guard = RECORD_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut record = load_approved(dir);
    change(&mut record);
    std::fs::create_dir_all(dir)?;
    let tmp = dir.join(format!("{APPROVED_PROGRAMS_FILE}.tmp"));
    std::fs::write(&tmp, serde_json::to_vec_pretty(&record).map_err(std::io::Error::other)?)?;
    std::fs::rename(&tmp, dir.join(APPROVED_PROGRAMS_FILE))?;
    Ok(record)
}

#[cfg(test)]
mod record_tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("wb-sandbox-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_missing_record_approves_nothing() {
        let d = temp_dir("missing");
        assert_eq!(load_approved(&d), ApprovedPrograms::default());
        // Nor does a missing directory (the window removed $APPDATA).
        assert_eq!(load_approved(&d.join("gone")), ApprovedPrograms::default());
    }

    #[test]
    fn an_empty_or_garbled_record_approves_nothing() {
        let d = temp_dir("garbled");
        for text in ["", "{", "null", "[]", r#"{"pandoc": 7}"#] {
            std::fs::write(d.join(APPROVED_PROGRAMS_FILE), text).unwrap();
            assert_eq!(load_approved(&d), ApprovedPrograms::default(), "{text:?}");
        }
    }

    #[test]
    fn a_record_naming_a_relative_program_approves_nothing() {
        let d = temp_dir("relative");
        std::fs::write(
            d.join(APPROVED_PROGRAMS_FILE),
            r#"{"pandoc":"/opt/homebrew/bin/pandoc","custom_assist":{"program":"sh","args":[],"prompt_via":"stdin"}}"#,
        )
        .unwrap();
        assert_eq!(load_approved(&d), ApprovedPrograms::default());
    }

    #[test]
    fn a_written_record_reads_back() {
        // A positive control for the fail-closed tests above.
        let d = temp_dir("roundtrip");
        let custom = CustomAssist { program: "/usr/local/bin/llm".into(), args: vec!["-m".into(), "x".into()], prompt_via: PromptVia::Arg };
        update_approved(&d, |r| {
            r.pandoc = Some("/opt/homebrew/bin/pandoc".into());
            r.custom_assist = Some(custom.clone());
        })
        .unwrap();
        let back = load_approved(&d);
        assert_eq!(back.pandoc.as_deref(), Some(Path::new("/opt/homebrew/bin/pandoc")));
        assert_eq!(back.custom_assist, Some(custom));
        // Forgetting one keeps the other.
        update_approved(&d, |r| r.pandoc = None).unwrap();
        assert_eq!(load_approved(&d).pandoc, None);
        assert!(load_approved(&d).custom_assist.is_some());
        assert!(!d.join(format!("{APPROVED_PROGRAMS_FILE}.tmp")).exists());
    }
}

#[cfg(test)]
mod tests {
    use super::APPROVED_PROGRAMS_FILE;
    use tauri::utils::config::FsScope;
    use tauri::Manager;

    /// A `$APPDATA/**` scope — the glob the capability's write grants use —
    /// with the config left at its default for the leading-dot rule, as ours
    /// is. The capability itself is tested in capability_tests.rs.
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

    /// Programs run only through the job commands. A shell-plugin grant would
    /// let the window spawn a program with its own arguments again.
    #[test]
    fn the_window_has_no_shell() {
        let cap: serde_json::Value = serde_json::from_str(include_str!("../capabilities/default.json"))
            .expect("capabilities/default.json parses");
        let perms = cap["permissions"].as_array().expect("permissions");
        assert!(!perms.is_empty());
        for p in perms {
            let id = p.as_str().or_else(|| p["identifier"].as_str()).unwrap_or("");
            assert!(!id.starts_with("shell:"), "capability grants {id}");
        }
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
