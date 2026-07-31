//! AI-assist commands (design d4-ai-assist.md → generalized in
//! d7-multi-provider-assist.md §B, divergence A: Rust command, not
//! plugin-shell). Two GENERIC commands drive ANY resolved AI CLI (Claude Code,
//! Codex, Gemini, or a user-supplied custom command). The frontend (Slice A)
//! owns the per-tool registry (binary ladder, argv, stdin-vs-arg prompt
//! delivery, output parsing); Rust owns only the trust boundary and the
//! subprocess plumbing:
//!
//! - `assist_which` — resolve an ABSOLUTE path to a CLI binary, or None. A
//!   Finder-launched .app inherits launchd's minimal PATH
//!   (`/usr/bin:/bin:/usr/sbin:/sbin`), so bare names never resolve; we probe
//!   the frontend-supplied `candidates` ladder, then (optionally) fall back to
//!   a login shell (`/bin/zsh -lc "command -v <bin_name>"`). `bin_name` is the
//!   ONE token interpolated into that shell string, so it is validated against
//!   `^[A-Za-z0-9_-]+$` FIRST — any shell metacharacter → None, shell never
//!   runs.
//!
//! - `assist_run` — run a resolved ABSOLUTE executable with a fixed `args`
//!   array via `Command` (execve — NO shell parses argv), optionally writing
//!   `stdin` to the child. The prompt is now EITHER a positional arg (arg-mode
//!   tools) OR stdin (stdin-mode) — both are safe under execve, so neither is
//!   special-cased. Rust owns the timeout (kill on expiry) and stderr
//!   redaction: full stderr is logged to the Rust console only, never returned
//!   to the frontend; on failure stderr+stdout are sniffed for auth signatures.
//!
//! The frontend contract (src/lib/assist/ codes against exactly this):
//!   invoke('assist_run', { binPath, args, stdin, timeoutMs })
//!     => { ok: true, text: string }
//!      | { ok: false, kind: "unauth" | "timeout" | "error" }
//!     where `text` is the RAW stdout of the CLI (the TS side parses whatever
//!     envelope the tool emits; Rust only checks exit status + non-emptiness).
//!   invoke('assist_which', { candidates, binName }) => string | null

use serde::Serialize;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Serializes to `{ ok: true, text }` or `{ ok: false, kind }`.
#[derive(Serialize, Debug)]
#[serde(untagged)]
pub enum AssistOutcome {
    Success {
        ok: bool, // always true
        text: String,
    },
    Failure {
        ok: bool, // always false
        kind: &'static str, // "unauth" | "timeout" | "error"
    },
}

impl AssistOutcome {
    fn success(text: String) -> Self {
        AssistOutcome::Success { ok: true, text }
    }
    fn failure(kind: &'static str) -> Self {
        AssistOutcome::Failure { ok: false, kind }
    }
}

// ── binary resolution (assist_which) ─────────────────────────────────────────

const LOGIN_SHELL: &str = "/bin/zsh";
const RESOLVE_TIMEOUT: Duration = Duration::from_secs(5);

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

#[cfg(unix)]
fn is_executable_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(path) {
        Ok(meta) => meta.is_file() && meta.permissions().mode() & 0o111 != 0,
        Err(_) => false,
    }
}

#[cfg(not(unix))]
fn is_executable_file(path: &Path) -> bool {
    path.is_file()
}

/// A bin name is safe to interpolate into the `command -v <name>` login-shell
/// string ONLY if it is a plain identifier. Anything else (spaces, `;`, `$`,
/// backticks, quotes, slashes…) is rejected — the shell is never run for it.
fn is_safe_bin_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

fn which_blocking(candidates: Vec<String>, bin_name: Option<String>) -> Option<String> {
    // 1. Frontend-supplied absolute ladder: first existing executable wins.
    for candidate in &candidates {
        let path = Path::new(candidate);
        if is_executable_file(path) {
            return Some(candidate.clone());
        }
    }

    // 2. Last rung: ask a login shell (sources the user's profile PATH) where
    //    the bin lives. Only if bin_name is a validated plain identifier — it
    //    is the sole token interpolated into the shell string.
    let bin_name = bin_name?;
    if !is_safe_bin_name(&bin_name) {
        eprintln!("[assist] refusing login-shell resolution: unsafe bin_name {bin_name:?}");
        return None;
    }

    let mut cmd = Command::new(LOGIN_SHELL);
    cmd.args(["-lc", &format!("command -v {bin_name}")]);
    match run_with_timeout(cmd, None, RESOLVE_TIMEOUT) {
        Ok(out) if !out.timed_out && out.status == Some(0) => {
            let path = out.stdout.trim();
            if path.starts_with('/') && is_executable_file(Path::new(path)) {
                Some(path.to_string())
            } else {
                None
            }
        }
        Ok(_) => None,
        Err(err) => {
            eprintln!("[assist] login-shell resolution failed to spawn: {err}");
            None
        }
    }
}

/// Resolve an absolute path to a CLI binary from the supplied `candidates`
/// ladder, falling back to a `command -v <bin_name>` login-shell rung when
/// `bin_name` is a validated plain identifier. Returns None if nothing exists.
#[tauri::command]
pub async fn assist_which(candidates: Vec<String>, bin_name: Option<String>) -> Option<String> {
    tauri::async_runtime::spawn_blocking(move || which_blocking(candidates, bin_name))
        .await
        .ok()
        .flatten()
}

// ── run (assist_run) ─────────────────────────────────────────────────────────

/// Auth-failure signatures sniffed (case-insensitively) from stderr+stdout of
/// a failed run. Matching any → kind "unauth".
const UNAUTH_SIGNATURES: [&str; 4] = ["not logged in", "authenticate", "login", "api key"];

/// PATH insurance for the child: a Finder-launched app's PATH lacks the
/// user-level bin dirs; if the CLI shells out to helpers, give it the usual
/// suspects. Appended (never prepended), so a terminal-launched dev app is
/// unchanged.
fn augmented_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<String> = if base.is_empty() {
        Vec::new()
    } else {
        base.split(':').map(str::to_string).collect()
    };
    let mut extras = vec![
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
    ];
    if let Some(home) = home_dir() {
        extras.push(home.join(".local/bin").to_string_lossy().into_owned());
        extras.push(home.join(".claude/local").to_string_lossy().into_owned());
    }
    for extra in extras {
        if !parts.iter().any(|p| p == &extra) {
            parts.push(extra);
        }
    }
    parts.join(":")
}

fn run_blocking(
    bin_path: &str,
    args: &[String],
    stdin: Option<String>,
    timeout_ms: u64,
) -> AssistOutcome {
    let path = Path::new(bin_path);
    if !path.is_absolute() || !is_executable_file(path) {
        eprintln!("[assist] bin_path is not an absolute executable: {bin_path}");
        return AssistOutcome::failure("error");
    }

    // Frontend-owned argv ARRAY under execve — no shell parses it. The prompt
    // may live in `args` (arg-mode) or in `stdin` (stdin-mode); both are safe.
    let mut cmd = Command::new(bin_path);
    cmd.args(args);
    cmd.env("PATH", augmented_path());
    // Run in a NEUTRAL working directory (the app's temp dir), not the app's
    // inherited cwd (`/` for a Finder-launched .app). A subprocess's file
    // access is attributed to the PARENT app under macOS TCC, so an AI CLI that
    // establishes "project context" from its cwd would wander into
    // Documents/Desktop/Downloads and trigger a slew of "Translation Workbench
    // wants to access <folder>" prompts. An empty temp cwd gives it no tree to
    // scan and keeps it out of the user's protected folders.
    cmd.current_dir(std::env::temp_dir());

    let timeout = Duration::from_millis(timeout_ms);

    let out = match run_with_timeout(cmd, stdin, timeout) {
        Ok(out) => out,
        Err(err) => {
            eprintln!("[assist] failed to spawn {bin_path}: {err}");
            return AssistOutcome::failure("error");
        }
    };

    if out.timed_out {
        eprintln!("[assist] {bin_path} timed out after {timeout_ms}ms — child killed");
        return AssistOutcome::failure("timeout");
    }

    if out.status == Some(0) && !out.stdout.trim().is_empty() {
        // Raw stdout: the TS side parses whatever envelope the tool emits.
        return AssistOutcome::success(out.stdout);
    }

    // Failure: log full stderr to the Rust console ONLY — never the frontend.
    eprintln!(
        "[assist] {bin_path} exited with status {:?}; stderr:\n{}",
        out.status, out.stderr
    );
    let haystack = format!("{}\n{}", out.stderr, out.stdout).to_lowercase();
    if UNAUTH_SIGNATURES.iter().any(|sig| haystack.contains(sig)) {
        AssistOutcome::failure("unauth")
    } else {
        AssistOutcome::failure("error")
    }
}

/// Run a resolved AI CLI (absolute executable) with a fixed `args` array,
/// optionally writing `stdin` to the child. Returns `{ ok: true, text }` (raw
/// stdout) or `{ ok: false, kind: "unauth" | "timeout" | "error" }`.
#[tauri::command]
pub async fn assist_run(
    bin_path: String,
    args: Vec<String>,
    stdin: Option<String>,
    timeout_ms: u64,
) -> AssistOutcome {
    tauri::async_runtime::spawn_blocking(move || {
        run_blocking(&bin_path, &args, stdin, timeout_ms)
    })
    .await
    .unwrap_or_else(|err| {
        eprintln!("[assist] run task panicked: {err}");
        AssistOutcome::failure("error")
    })
}

// ── subprocess plumbing ─────────────────────────────────────────────────────

struct RunOutput {
    /// Exit code; None when the process was killed (timeout) or died to a signal.
    status: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

/// Spawn `cmd` with piped stdio, optionally write `stdin_data` to the child
/// (from a helper thread, so a full pipe buffer can't deadlock us), read
/// stdout/stderr concurrently, and enforce `timeout` with a kill.
fn run_with_timeout(
    mut cmd: Command,
    stdin_data: Option<String>,
    timeout: Duration,
) -> std::io::Result<RunOutput> {
    cmd.stdin(if stdin_data.is_some() {
        Stdio::piped()
    } else {
        Stdio::null()
    })
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    let mut child = cmd.spawn()?;

    if let Some(data) = stdin_data {
        if let Some(mut sin) = child.stdin.take() {
            // Write then drop → EOF; ignore EPIPE if the child exits early.
            std::thread::spawn(move || {
                let _ = sin.write_all(data.as_bytes());
            });
        }
    }

    let stdout_reader = spawn_pipe_reader(child.stdout.take());
    let stderr_reader = spawn_pipe_reader(child.stderr.take());

    let deadline = Instant::now() + timeout;
    let mut timed_out = false;
    let status = loop {
        match child.try_wait()? {
            Some(status) => break Some(status),
            None => {
                if Instant::now() >= deadline {
                    timed_out = true;
                    let _ = child.kill();
                    let _ = child.wait();
                    break None;
                }
                std::thread::sleep(Duration::from_millis(25));
            }
        }
    };

    // Readers see EOF once the child is dead (or killed); join returns.
    let stdout = stdout_reader.map(|h| h.join().unwrap_or_default()).unwrap_or_default();
    let stderr = stderr_reader.map(|h| h.join().unwrap_or_default()).unwrap_or_default();

    Ok(RunOutput {
        status: status.and_then(|s| s.code()),
        stdout,
        stderr,
        timed_out,
    })
}

fn spawn_pipe_reader<R: Read + Send + 'static>(
    pipe: Option<R>,
) -> Option<std::thread::JoinHandle<String>> {
    pipe.map(|mut r| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = r.read_to_end(&mut buf);
            String::from_utf8_lossy(&buf).into_owned()
        })
    })
}

// ── run_program (export's user-chosen pandoc) ───────────────────────────────
//
// Same trust boundary as assist_run: an ABSOLUTE executable the user picked
// themselves (here, via the Export settings' native file picker), run under
// execve with a frontend-supplied argv array — no shell ever parses it. The
// one difference is the success test. assist_run treats "exit 0 with EMPTY
// stdout" as a failure, because an AI CLI that prints nothing has told us
// nothing; pandoc on success prints nothing at all, so that heuristic would
// report every successful export as a failure. This command therefore reports
// the exit code plainly and leaves the verdict to the caller.
//
// stderr comes back to the frontend here (assist_run deliberately withholds
// it) because pandoc's stderr IS the diagnosis for a failed conversion, and
// the export UI already has a "console only, one plain sentence to the user"
// discipline for it — see ExportButton.svelte / CompileDialog.svelte.

#[derive(Serialize)]
pub struct RunOutcome {
    /// Exit code; None when the process was killed (timeout) or never spawned.
    code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
    /// False when the binary isn't an absolute executable, or wouldn't spawn.
    spawned: bool,
}

/// Run an absolute executable with a fixed argv array and capture its result.
#[tauri::command]
pub async fn run_program(bin_path: String, args: Vec<String>, timeout_ms: u64) -> RunOutcome {
    tauri::async_runtime::spawn_blocking(move || run_program_blocking(&bin_path, &args, timeout_ms))
        .await
        .unwrap_or_else(|err| {
            eprintln!("[run_program] task panicked: {err}");
            RunOutcome {
                code: None,
                stdout: String::new(),
                stderr: String::new(),
                timed_out: false,
                spawned: false,
            }
        })
}

fn run_program_blocking(bin_path: &str, args: &[String], timeout_ms: u64) -> RunOutcome {
    let not_spawned = || RunOutcome {
        code: None,
        stdout: String::new(),
        stderr: String::new(),
        timed_out: false,
        spawned: false,
    };

    let path = Path::new(bin_path);
    if !path.is_absolute() || !is_executable_file(path) {
        eprintln!("[run_program] bin_path is not an absolute executable: {bin_path}");
        return not_spawned();
    }

    let mut cmd = Command::new(bin_path);
    cmd.args(args);
    cmd.env("PATH", augmented_path());
    // Neutral cwd, same reasoning as run_blocking: a subprocess's file access
    // is attributed to the parent app under macOS TCC.
    cmd.current_dir(std::env::temp_dir());

    match run_with_timeout(cmd, None, Duration::from_millis(timeout_ms)) {
        Ok(out) => RunOutcome {
            code: out.status,
            stdout: out.stdout,
            stderr: out.stderr,
            timed_out: out.timed_out,
            spawned: true,
        },
        Err(err) => {
            eprintln!("[run_program] failed to spawn {bin_path}: {err}");
            not_spawned()
        }
    }
}

// ── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outcome_serializes_to_contract_shapes() {
        let ok = serde_json::to_value(AssistOutcome::success("raw".into())).unwrap();
        assert_eq!(ok, serde_json::json!({ "ok": true, "text": "raw" }));
        let err = serde_json::to_value(AssistOutcome::failure("timeout")).unwrap();
        assert_eq!(err, serde_json::json!({ "ok": false, "kind": "timeout" }));
    }

    #[test]
    fn unauth_sniff_matches_signatures() {
        let hay = "Error: Please run /login to authenticate".to_lowercase();
        assert!(UNAUTH_SIGNATURES.iter().any(|s| hay.contains(s)));
        let hay2 = "Invalid API key".to_lowercase();
        assert!(UNAUTH_SIGNATURES.iter().any(|s| hay2.contains(s)));
        let hay3 = "segmentation fault".to_lowercase();
        assert!(!UNAUTH_SIGNATURES.iter().any(|s| hay3.contains(s)));
    }

    #[test]
    fn timeout_kills_child() {
        let mut cmd = Command::new("/bin/sleep");
        cmd.arg("30");
        let start = Instant::now();
        let out = run_with_timeout(cmd, None, Duration::from_millis(200)).unwrap();
        assert!(out.timed_out);
        assert!(out.status.is_none());
        assert!(start.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn run_captures_stdout_and_status() {
        let mut cmd = Command::new("/bin/sh");
        cmd.args(["-c", "printf hello; printf world >&2"]);
        let out = run_with_timeout(cmd, None, Duration::from_secs(5)).unwrap();
        assert!(!out.timed_out);
        assert_eq!(out.status, Some(0));
        assert_eq!(out.stdout, "hello");
        assert_eq!(out.stderr, "world");
    }

    #[test]
    fn stdin_reaches_child() {
        let cmd = Command::new("/bin/cat");
        let out = run_with_timeout(cmd, Some("σύνθεσις\n\nline".into()), Duration::from_secs(5))
            .unwrap();
        assert_eq!(out.status, Some(0));
        assert_eq!(out.stdout, "σύνθεσις\n\nline");
    }

    // ── assist_run: bin_path validation ──────────────────────────────────────

    #[test]
    fn run_rejects_non_absolute_bin_path() {
        // A bare/relative name is not an absolute path → error, never spawned.
        let outcome = run_blocking("echo", &["hi".into()], None, 5_000);
        assert!(matches!(
            outcome,
            AssistOutcome::Failure { kind: "error", .. }
        ));
    }

    #[test]
    fn run_rejects_non_executable_bin_path() {
        // An absolute path that isn't an executable file → error.
        let outcome = run_blocking("/etc/hosts", &[], None, 5_000);
        assert!(matches!(
            outcome,
            AssistOutcome::Failure { kind: "error", .. }
        ));
    }

    #[test]
    fn run_arg_mode_prompt_reaches_child() {
        // Arg-mode tools receive the prompt as a positional arg (safe under
        // execve). /bin/echo emits its args → stdout must contain the prompt.
        let prompt = "translate: σύνθεσις; $(whoami) `id` ;rm".to_string();
        let outcome = run_blocking("/bin/echo", &[prompt.clone()], None, 5_000);
        match outcome {
            AssistOutcome::Success { text, .. } => {
                assert!(text.contains(&prompt), "stdout {text:?} missing prompt");
            }
            other => panic!("expected success, got {other:?}"),
        }
    }

    #[test]
    fn run_stdin_mode_prompt_reaches_child() {
        // Stdin-mode tools receive the prompt on stdin. /bin/cat echoes it.
        let prompt = "SYS\n\nUSER prompt".to_string();
        let outcome = run_blocking("/bin/cat", &[], Some(prompt.clone()), 5_000);
        match outcome {
            AssistOutcome::Success { text, .. } => assert_eq!(text, prompt),
            other => panic!("expected success, got {other:?}"),
        }
    }

    #[test]
    fn run_timeout_yields_timeout_kind() {
        let outcome = run_blocking("/bin/sleep", &["30".into()], None, 200);
        assert!(matches!(
            outcome,
            AssistOutcome::Failure { kind: "timeout", .. }
        ));
    }

    // ── assist_which: bin_name validation ────────────────────────────────────

    #[test]
    fn which_returns_first_existing_candidate() {
        let resolved = which_blocking(
            vec!["/no/such/thing".into(), "/bin/cat".into()],
            None,
        );
        assert_eq!(resolved.as_deref(), Some("/bin/cat"));
    }

    #[test]
    fn which_none_when_no_candidate_and_no_bin_name() {
        let resolved = which_blocking(vec!["/no/such/thing".into()], None);
        assert_eq!(resolved, None);
    }

    #[test]
    fn safe_bin_name_accepts_plain_identifiers() {
        assert!(is_safe_bin_name("claude"));
        assert!(is_safe_bin_name("codex"));
        assert!(is_safe_bin_name("gemini-cli"));
        assert!(is_safe_bin_name("my_tool2"));
    }

    #[test]
    fn safe_bin_name_rejects_shell_metacharacters() {
        assert!(!is_safe_bin_name(""));
        assert!(!is_safe_bin_name("claude; rm -rf /"));
        assert!(!is_safe_bin_name("$(whoami)"));
        assert!(!is_safe_bin_name("a b"));
        assert!(!is_safe_bin_name("foo`id`"));
        assert!(!is_safe_bin_name("../bin/evil"));
        assert!(!is_safe_bin_name("foo|bar"));
    }

    #[test]
    fn which_never_runs_shell_for_unsafe_bin_name() {
        // A malicious bin_name with a metacharacter must return None WITHOUT
        // invoking the login shell. If the shell ran the `;` payload, the marker
        // file would be created; assert it never is.
        let marker = std::env::temp_dir().join(format!(
            "assist_which_pwned_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&marker);
        let payload = format!("x; touch {}", marker.display());
        let resolved = which_blocking(vec!["/no/such/thing".into()], Some(payload));
        assert_eq!(resolved, None);
        assert!(
            !marker.exists(),
            "shell payload executed — marker {marker:?} was created"
        );
        let _ = std::fs::remove_file(&marker);
    }
}
