//! AI-assist commands (design d4-ai-assist.md, divergence A: Rust command,
//! not plugin-shell). Two commands:
//!
//! - `assist_resolve_claude` — resolve an ABSOLUTE path to the user's
//!   `claude` binary. A Finder-launched .app inherits launchd's minimal PATH
//!   (`/usr/bin:/bin:/usr/sbin:/sbin`), so bare names never resolve; we probe
//!   a fixed candidate ladder, then fall back to a login shell with a FIXED
//!   argv constant (`/bin/zsh -lc "command -v claude"` — no user data is ever
//!   near the shell).
//!
//! - `assist_suggest` — run the resolved binary in print mode
//!   (`-p --output-format json`) with the prompt written to the child's
//!   STDIN. Prompt text NEVER appears in argv, and no shell ever parses it.
//!   Rust owns the timeout (kill on expiry) and stderr redaction: stderr is
//!   logged to the Rust console only, never returned to the frontend.
//!
//! The frontend contract (src/lib/assist/ codes against exactly this):
//! `assist_suggest` takes `claude_path`, `system`, `user`, `timeout_ms`
//! (JS invoke keys: claudePath / system / user / timeoutMs — Tauri's default
//! camelCase argument mapping) and returns
//! `{ ok: true, text: string }` or
//! `{ ok: false, kind: "unauth" | "timeout" | "error" }`,
//! where `text` is the RAW stdout of the CLI (the TS side parses the JSON
//! envelope; Rust only checks exit status and non-emptiness).

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

// ── binary resolution ───────────────────────────────────────────────────────

/// Fixed argv for the last discovery rung. A constant — user data is never
/// anywhere near this shell invocation.
const LOGIN_SHELL: &str = "/bin/zsh";
const LOGIN_SHELL_ARGS: [&str; 2] = ["-lc", "command -v claude"];
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

/// Candidate ladder: first existing executable wins.
fn candidate_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = home_dir() {
        candidates.push(home.join(".claude/local/claude"));
        candidates.push(home.join(".local/bin/claude"));
    }
    candidates.push(PathBuf::from("/opt/homebrew/bin/claude"));
    candidates.push(PathBuf::from("/usr/local/bin/claude"));
    candidates
}

fn resolve_claude_blocking() -> Option<String> {
    for candidate in candidate_paths() {
        if is_executable_file(&candidate) {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }

    // Last rung: ask a login shell (sources the user's profile PATH) where
    // claude lives. Fixed argv constant; 5s timeout; kill on expiry.
    let mut cmd = Command::new(LOGIN_SHELL);
    cmd.args(LOGIN_SHELL_ARGS);
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

/// Resolve an absolute path to the user's `claude` binary, or None.
#[tauri::command]
pub async fn assist_resolve_claude() -> Option<String> {
    tauri::async_runtime::spawn_blocking(resolve_claude_blocking)
        .await
        .ok()
        .flatten()
}

// ── suggestion ──────────────────────────────────────────────────────────────

/// Auth-failure signatures sniffed (case-insensitively) from stderr+stdout of
/// a failed run. Matching any → kind "unauth".
const UNAUTH_SIGNATURES: [&str; 4] = ["not logged in", "authenticate", "login", "api key"];

/// Compose the process input: system block, blank line, user block. The
/// prompt goes over stdin — never argv — so no shell/argv layer ever sees it.
fn compose_stdin(system: &str, user: &str) -> String {
    let system = system.trim();
    if system.is_empty() {
        user.to_string()
    } else {
        format!("{system}\n\n{user}")
    }
}

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

fn suggest_blocking(claude_path: &str, system: &str, user: &str, timeout_ms: u64) -> AssistOutcome {
    let path = Path::new(claude_path);
    if !path.is_absolute() || !is_executable_file(path) {
        eprintln!("[assist] claude path is not an absolute executable: {claude_path}");
        return AssistOutcome::failure("error");
    }

    // Fixed argv ARRAY — the prompt goes over stdin, never argv.
    let mut cmd = Command::new(claude_path);
    cmd.args(["-p", "--output-format", "json"]);
    cmd.env("PATH", augmented_path());

    let input = compose_stdin(system, user);
    let timeout = Duration::from_millis(timeout_ms);

    let out = match run_with_timeout(cmd, Some(input), timeout) {
        Ok(out) => out,
        Err(err) => {
            eprintln!("[assist] failed to spawn claude: {err}");
            return AssistOutcome::failure("error");
        }
    };

    if out.timed_out {
        eprintln!("[assist] claude timed out after {timeout_ms}ms — child killed");
        return AssistOutcome::failure("timeout");
    }

    let stdout_trimmed = out.stdout.trim();
    if out.status == Some(0) && !stdout_trimmed.is_empty() {
        // Raw stdout: the TS side parses the CLI's JSON envelope.
        return AssistOutcome::success(out.stdout);
    }

    // Failure: log full stderr to the Rust console ONLY — never the frontend.
    eprintln!(
        "[assist] claude exited with status {:?}; stderr:\n{}",
        out.status, out.stderr
    );
    let haystack = format!("{}\n{}", out.stderr, out.stdout).to_lowercase();
    if UNAUTH_SIGNATURES.iter().any(|sig| haystack.contains(sig)) {
        AssistOutcome::failure("unauth")
    } else {
        AssistOutcome::failure("error")
    }
}

/// Run the resolved `claude` binary in print mode with the composed prompt on
/// stdin. Returns `{ ok: true, text }` (raw stdout) or
/// `{ ok: false, kind: "unauth" | "timeout" | "error" }`.
#[tauri::command]
pub async fn assist_suggest(
    claude_path: String,
    system: String,
    user: String,
    timeout_ms: u64,
) -> AssistOutcome {
    tauri::async_runtime::spawn_blocking(move || {
        suggest_blocking(&claude_path, &system, &user, timeout_ms)
    })
    .await
    .unwrap_or_else(|err| {
        eprintln!("[assist] suggest task panicked: {err}");
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

// ── tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compose_joins_system_then_user_with_blank_line() {
        assert_eq!(compose_stdin("SYS", "USER"), "SYS\n\nUSER");
    }

    #[test]
    fn compose_empty_system_is_just_user() {
        assert_eq!(compose_stdin("", "USER"), "USER");
        assert_eq!(compose_stdin("   \n", "USER"), "USER");
    }

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
}
