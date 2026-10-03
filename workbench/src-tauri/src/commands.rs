// The job commands the window may call (workbench-design/sandboxing-plan.md,
// phase 2). The window names a job and supplies data; it never supplies a
// program or argv. Programs come from Rust's own search or from a native
// dialog Rust opens itself, recorded in $APPDATA/.approved-programs.json
// (sandbox.rs), which the window cannot write. A file or folder the window
// names for a job must be one the user picked in a native dialog (phase 3).

use crate::assist::{augmented_path, is_executable_file, run_blocking, run_with_timeout, which_blocking, AssistOutcome};
use crate::jobs::{
    diogenes_export_args, diogenes_server_candidates, is_really_inside, is_tested_codex, pandoc_docx_args,
    perl_candidates, AssistTool, Corpus, Invocation, LineMode,
};
use crate::sandbox::{load_approved, update_approved, ApprovedPrograms, CustomAssist, PromptVia};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_fs::FsExt;

const PROBE_TIMEOUT: Duration = Duration::from_secs(10);
const CONVERT_TIMEOUT: Duration = Duration::from_secs(120);
/// Whole-author exports are slow: Plato's 41 works take minutes.
const EXPORT_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const ASSIST_MAX_TIMEOUT_MS: u64 = 10 * 60 * 1000;

/// A finished (or failed-to-start) program run, for the window's console.
#[derive(Serialize, Debug)]
pub struct RunOutcome {
    /// Exit code; None when the process was killed (timeout) or never spawned.
    code: Option<i32>,
    stdout: String,
    stderr: String,
    timed_out: bool,
    spawned: bool,
}

impl RunOutcome {
    fn not_spawned() -> Self {
        RunOutcome { code: None, stdout: String::new(), stderr: String::new(), timed_out: false, spawned: false }
    }
}

fn run(cmd: Command, timeout: Duration) -> RunOutcome {
    match run_with_timeout(cmd, None, timeout) {
        Ok(out) => RunOutcome { code: out.status, stdout: out.stdout, stderr: out.stderr, timed_out: out.timed_out, spawned: true },
        Err(err) => {
            eprintln!("[jobs] failed to spawn: {err}");
            RunOutcome::not_spawned()
        }
    }
}

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| format!("no app data folder: {e}"))
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| format!("job panicked: {e}"))
}

// ── picks ───────────────────────────────────────────────────────────────────

/// True when the user picked `path` in a native dialog — this session, or an
/// earlier one restored by tauri-plugin-persisted-scope. The fs plugin's
/// runtime scope holds exactly those picks (and files dropped on the window);
/// the capability's own grants are not in it. `deep`: a folder must have been
/// picked with `recursive: true`, so what lies two levels down is open too.
pub fn is_picked<R: Runtime>(app: &AppHandle<R>, path: &Path, deep: bool) -> bool {
    let scope = app.fs_scope();
    path.is_absolute() && scope.is_allowed(path) && (!deep || scope.is_allowed(path.join("a").join("b")))
}

/// Why a stored path can or cannot be used — phase 4's "choose it again".
#[derive(Serialize, Debug, PartialEq, Eq, Clone, Copy)]
#[serde(rename_all = "kebab-case")]
pub enum PickStatus {
    Ok,
    /// Picked, but nothing is there now (moved, renamed, a drive unplugged).
    Missing,
    /// Never picked, or picked by a build that did not keep picks.
    NotPicked,
}

fn pick_status_of(path: &Path, picked: bool) -> PickStatus {
    if !path.is_absolute() || !picked {
        PickStatus::NotPicked
    } else if !path.exists() {
        PickStatus::Missing
    } else {
        PickStatus::Ok
    }
}

/// Whether a folder or file the window stored (library, TLG/PHI folder,
/// reference doc) can still be used. `deep` for a folder read below its top.
#[tauri::command]
pub fn pick_status(app: AppHandle, path: String, deep: Option<bool>) -> PickStatus {
    let path = PathBuf::from(path);
    let picked = is_picked(&app, &path, deep.unwrap_or(false));
    pick_status_of(&path, picked)
}

/// A program the user picks in a native file dialog Rust opens, so the window
/// can ask for a pick but cannot make one.
/// None when the user cancelled. The pick may not be a program at all; the
/// caller checks that before recording it.
fn pick_program(app: &AppHandle, title: &str) -> Option<PathBuf> {
    app.dialog().file().set_title(title).blocking_pick_file()?.into_path().ok()
}

// ── pandoc ──────────────────────────────────────────────────────────────────

/// Where Homebrew puts pandoc. A Finder-launched app's PATH has neither.
const PANDOC_CANDIDATES: [&str; 2] = ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"];

/// The pandoc to run: the user's pick when there is one — and then only that;
/// a pick that will not run is not quietly swapped for another — else one
/// Rust finds.
fn pandoc_program(approved: &ApprovedPrograms) -> (bool, Option<PathBuf>) {
    if let Some(p) = &approved.pandoc {
        return (true, is_executable_file(p).then(|| p.clone()));
    }
    let found = which_blocking(PANDOC_CANDIDATES.map(String::from).to_vec(), Some("pandoc".into()));
    (false, found.map(PathBuf::from))
}

/// The first line of `<program> --version`, when it runs cleanly.
fn version_line(program: &Path) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.arg("--version").env("PATH", augmented_path()).current_dir(std::env::temp_dir());
    let out = run(cmd, PROBE_TIMEOUT);
    (out.code == Some(0)).then(|| out.stdout.lines().next().unwrap_or("").trim().to_string())
}

#[derive(Serialize, Debug)]
pub struct PandocProbe {
    /// The program the user picked, if any — shown in Settings.
    picked: Option<String>,
    /// `pandoc 3.x`, or None when no pandoc runs.
    version: Option<String>,
}

/// Which pandoc export would use, and whether it runs.
#[tauri::command]
pub async fn pandoc_version(app: AppHandle) -> Result<PandocProbe, String> {
    let dir = app_data(&app)?;
    blocking(move || {
        let approved = load_approved(&dir);
        let (_, program) = pandoc_program(&approved);
        PandocProbe {
            picked: approved.pandoc.map(|p| p.display().to_string()),
            version: program.as_deref().and_then(version_line),
        }
    })
    .await
}

/// Ask the user for a pandoc in a native dialog, check it runs, and record it.
/// None when the user cancelled; `version: None` when the pick does not run,
/// in which case nothing changed.
#[tauri::command]
pub async fn pick_pandoc(app: AppHandle) -> Result<Option<PandocProbe>, String> {
    let dir = app_data(&app)?;
    blocking(move || {
        let Some(path) = pick_program(&app, "Choose the Pandoc program") else {
            return Ok(None);
        };
        let Some(version) = version_line(&path) else {
            eprintln!("[jobs] picked pandoc failed --version: {}", path.display());
            return Ok(Some(PandocProbe { picked: load_approved(&dir).pandoc.map(|p| p.display().to_string()), version: None }));
        };
        update_approved(&dir, |r| r.pandoc = Some(path.clone())).map_err(|e| e.to_string())?;
        Ok(Some(PandocProbe { picked: Some(path.display().to_string()), version: Some(version) }))
    })
    .await?
}

/// Forget the user's pandoc; export goes back to the one Rust finds.
#[tauri::command]
pub async fn forget_pandoc(app: AppHandle) -> Result<(), String> {
    let dir = app_data(&app)?;
    blocking(move || update_approved(&dir, |r| r.pandoc = None).map(|_| ()).map_err(|e| e.to_string())).await?
}

/// Word targets the user chose in the save dialog Rust opened, each good for
/// one export. Only Rust's own save dialog adds to it: the fs plugin's runtime
/// scope also holds open-dialog picks, such as a reference doc or a whole
/// library folder, which pandoc must not be able to overwrite.
#[derive(Default)]
pub struct SaveTargets(Mutex<Vec<PathBuf>>);

impl SaveTargets {
    const fn new() -> Self {
        SaveTargets(Mutex::new(Vec::new()))
    }
    fn add(&self, path: PathBuf) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).push(path);
    }
    /// True, once, for a target the user chose.
    fn take(&self, path: &Path) -> bool {
        let mut targets = self.0.lock().unwrap_or_else(|e| e.into_inner());
        match targets.iter().position(|t| t == path) {
            Some(i) => {
                targets.remove(i);
                true
            }
            None => false,
        }
    }
}

static SAVE_TARGETS: SaveTargets = SaveTargets::new();

/// Ask the user where to save a Word document, in a save dialog Rust opens.
/// `default_path` is a file name, or a folder and a file name, to start from.
/// None when the user cancelled.
#[tauri::command]
pub async fn choose_docx_target(app: AppHandle, default_path: Option<String>) -> Result<Option<String>, String> {
    blocking(move || {
        let mut dialog = app.dialog().file().add_filter("Word document", &["docx"]);
        if let Some(p) = default_path.map(PathBuf::from) {
            if let Some(name) = p.file_name() {
                dialog = dialog.set_file_name(name.to_string_lossy());
            }
            if let Some(dir) = p.parent().filter(|d| d.is_absolute()) {
                dialog = dialog.set_directory(dir);
            }
        }
        let path = dialog.blocking_save_file()?.into_path().ok()?;
        SAVE_TARGETS.add(path.clone());
        Some(path.display().to_string())
    })
    .await
}

/// The checks on an export's paths. `md` is the intermediate Markdown the
/// window wrote under app data; `docx` must be a target the user chose in
/// Rust's save dialog (`docx_picked`). Every path is absolute, so none can
/// reach pandoc as a flag.
fn check_export_paths(appdata: &Path, md: &Path, docx: &Path, docx_picked: bool) -> Result<(), String> {
    if !is_really_inside(md, appdata) || !md.is_file() {
        return Err(format!("export source is not a file in app data: {}", md.display()));
    }
    let is_docx = docx.extension().is_some_and(|e| e.eq_ignore_ascii_case("docx"));
    if !docx.is_absolute() || !is_docx || !docx_picked {
        return Err(format!("export target was not chosen in the save dialog: {}", docx.display()));
    }
    Ok(())
}

/// A reference doc pandoc may read: the one bundled with the app, compared by
/// real path, or one the user picked.
fn check_reference_doc(r: &Path, bundled: Option<&Path>, picked: bool) -> Result<(), String> {
    if !r.is_absolute() || !r.is_file() {
        return Err(format!("reference doc is not a file: {}", r.display()));
    }
    let real = |p: &Path| p.canonicalize().ok();
    let is_bundled = bundled.and_then(real).is_some_and(|b| real(r) == Some(b));
    if !is_bundled && !picked {
        return Err(format!("reference doc was not chosen in a dialog: {}", r.display()));
    }
    Ok(())
}

/// Where the bundled reference.docx sits — the path declared in
/// tauri.conf.json's bundle.resources, which the bundler keeps.
fn bundled_reference_doc(app: &AppHandle) -> Option<PathBuf> {
    app.path().resolve("resources/reference.docx", BaseDirectory::Resource).ok()
}

/// Convert the intermediate Markdown to Word with pandoc. pandoc prints
/// nothing on success, so the caller reads the exit code.
#[tauri::command]
pub async fn export_docx(app: AppHandle, md: String, docx: String, reference_doc: Option<String>) -> Result<RunOutcome, String> {
    let dir = app_data(&app)?;
    let docx = PathBuf::from(docx);
    let docx_picked = SAVE_TARGETS.take(&docx);
    let reference_doc = reference_doc.map(PathBuf::from);
    let reference_picked = reference_doc.as_deref().is_some_and(|r| is_picked(&app, r, false));
    let bundled = bundled_reference_doc(&app);
    blocking(move || {
        let md = PathBuf::from(md);
        check_export_paths(&dir, &md, &docx, docx_picked)?;
        if let Some(r) = &reference_doc {
            check_reference_doc(r, bundled.as_deref(), reference_picked)?;
        }
        let (_, Some(program)) = pandoc_program(&load_approved(&dir)) else {
            return Ok(RunOutcome::not_spawned());
        };
        let mut cmd = Command::new(program);
        cmd.args(pandoc_docx_args(&md, &docx, reference_doc.as_deref()))
            .env("PATH", augmented_path())
            .current_dir(std::env::temp_dir());
        Ok(run(cmd, CONVERT_TIMEOUT))
    })
    .await?
}

// ── Diogenes ────────────────────────────────────────────────────────────────

/// The first Diogenes server folder that holds xml-export.pl.
fn diogenes_server() -> Option<PathBuf> {
    diogenes_server_candidates().into_iter().find(|d| d.join("xml-export.pl").is_file())
}

/// Where Diogenes is installed, or None — onboarding and the disc importer
/// ask before offering an export.
#[tauri::command]
pub async fn diogenes_status() -> Result<Option<String>, String> {
    blocking(|| diogenes_server().map(|p| p.display().to_string())).await
}

#[derive(Serialize, Debug)]
pub struct DiogenesOutcome {
    /// Where the export landed; the exporter appends Diogenes-Resources/xml/<corpus>/.
    out_dir: String,
    run: RunOutcome,
}

/// A disc folder Diogenes may read: an existing folder the user picked.
fn check_disc_dir(dir: &Path, picked: bool) -> Result<(), String> {
    if !dir.is_absolute() || !dir.is_dir() {
        return Err(format!("disc folder is not a folder: {}", dir.display()));
    }
    if !picked {
        return Err(format!("disc folder was not chosen in a dialog: {}", dir.display()));
    }
    Ok(())
}

/// Run xml-export.pl from its own folder (it loads its modules by relative
/// path), with the disc folder in the one environment variable Diogenes reads.
fn run_diogenes(perl: &Path, server: &Path, corpus: Corpus, disc_dir: &Path, args: Vec<String>, timeout: Duration) -> RunOutcome {
    let mut cmd = Command::new(perl);
    cmd.args(args)
        .current_dir(server)
        .env("PATH", augmented_path())
        .env(corpus.disc_env_var(), disc_dir);
    run(cmd, timeout)
}

/// Export one author from the user's TLG or PHI disc into
/// $APPDATA/corpus/disc-export/<line mode>.
#[tauri::command]
pub async fn diogenes_export(
    app: AppHandle,
    corpus: String,
    author: String,
    line_mode: String,
    disc_dir: String,
) -> Result<DiogenesOutcome, String> {
    let dir = app_data(&app)?;
    let disc_dir = PathBuf::from(disc_dir);
    let disc_picked = is_picked(&app, &disc_dir, false);
    blocking(move || {
        let corpus = Corpus::parse(&corpus)?;
        let line_mode = LineMode::parse(&line_mode)?;
        check_disc_dir(&disc_dir, disc_picked)?;
        let out_dir = dir.join("corpus").join("disc-export").join(line_mode.name());
        std::fs::create_dir_all(&out_dir).map_err(|e| format!("cannot create {}: {e}", out_dir.display()))?;
        if !is_really_inside(&out_dir, &dir) {
            return Err(format!("export folder resolves outside app data: {}", out_dir.display()));
        }
        let args = diogenes_export_args(corpus, &author, &out_dir, line_mode)?;
        let out_dir_text = out_dir.display().to_string();
        let Some(server) = diogenes_server() else {
            return Ok(DiogenesOutcome { out_dir: out_dir_text, run: RunOutcome::not_spawned() });
        };
        let Some(perl) = perl_candidates(&server).into_iter().find(|p| is_executable_file(p)) else {
            eprintln!("[jobs] no perl for Diogenes at {}", server.display());
            return Ok(DiogenesOutcome { out_dir: out_dir_text, run: RunOutcome::not_spawned() });
        };
        Ok(DiogenesOutcome { out_dir: out_dir_text, run: run_diogenes(&perl, &server, corpus, &disc_dir, args, EXPORT_TIMEOUT) })
    })
    .await?
}

// ── AI assist ───────────────────────────────────────────────────────────────

fn home() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()
}

/// Where a built-in AI CLI is, found by Rust alone.
fn find_tool(tool: AssistTool) -> Option<PathBuf> {
    let candidates = tool.candidate_paths(&home()).iter().map(|p| p.display().to_string()).collect();
    which_blocking(candidates, Some(tool.bin_name().into())).map(PathBuf::from)
}

/// The program and invocation for `tool` ("claude", "codex" or "custom"), or why there is none.
/// `model` is the window's pick from the tool's fixed list (None or empty: the
/// CLI's default); the custom command takes none.
fn assist_command(tool: &str, approved: &ApprovedPrograms, prompt: &str, model: Option<&str>) -> Result<(PathBuf, Invocation), String> {
    if tool == "custom" {
        if model.is_some_and(|m| !m.is_empty()) {
            return Err("the custom command takes no model".into());
        }
        let c = approved.custom_assist.as_ref().ok_or("no custom command approved")?;
        let mut args = c.args.clone();
        let stdin = match c.prompt_via {
            PromptVia::Stdin => Some(prompt.to_string()),
            PromptVia::Arg => {
                args.push(prompt.to_string());
                None
            }
        };
        return Ok((c.program.clone(), Invocation { args, stdin }));
    }
    let t = AssistTool::parse(tool)?;
    let inv = t.invocation(prompt, model)?;
    let program = find_tool(t).ok_or_else(|| format!("{tool} is not installed"))?;
    Ok((program, inv))
}

#[derive(Serialize, Debug)]
pub struct CustomAssistView {
    program: String,
    args: Vec<String>,
    prompt_via: PromptVia,
}

impl From<&CustomAssist> for CustomAssistView {
    fn from(c: &CustomAssist) -> Self {
        CustomAssistView { program: c.program.display().to_string(), args: c.args.clone(), prompt_via: c.prompt_via }
    }
}

#[derive(Serialize, Debug)]
pub struct AssistDetection {
    claude: Option<String>,
    codex: Option<String>,
    custom: Option<CustomAssistView>,
}

/// Which AI CLIs Rust can find, and the approved custom command.
#[tauri::command]
pub async fn assist_detect(app: AppHandle) -> Result<AssistDetection, String> {
    let dir = app_data(&app)?;
    blocking(move || {
        let found = |t| find_tool(t).map(|p| p.display().to_string());
        AssistDetection {
            claude: found(AssistTool::Claude),
            codex: found(AssistTool::Codex),
            custom: load_approved(&dir).custom_assist.as_ref().map(CustomAssistView::from),
        }
    })
    .await
}

/// Whether the Codex at `program` is a version its tools-off switches were
/// checked against (jobs.rs `TESTED_CODEX_VERSIONS`). `codex --version` runs
/// once per binary: the answer is kept against the binary's real path and
/// modification time, so an upgrade in place is asked again. A `--version`
/// that fails is not kept, and counts as untested.
fn codex_is_tested(program: &Path) -> bool {
    static CHECKED: Mutex<Option<(PathBuf, SystemTime, bool)>> = Mutex::new(None);
    let real = program.canonicalize().unwrap_or_else(|_| program.to_path_buf());
    let mtime = std::fs::metadata(&real).and_then(|m| m.modified()).ok();
    if let (Some(mtime), Ok(checked)) = (mtime, CHECKED.lock()) {
        if let Some((p, t, tested)) = checked.as_ref() {
            if *p == real && *t == mtime {
                return *tested;
            }
        }
    }
    let AssistOutcome::Success { text, .. } = run_blocking(&program.display().to_string(), &["--version".into()], None, 10_000)
    else {
        eprintln!("[assist] codex --version failed; treating {} as untested", program.display());
        return false;
    };
    let tested = is_tested_codex(&text);
    if !tested {
        eprintln!("[assist] refusing untested Codex at {}: {}", program.display(), text.trim());
    }
    if let (Some(mtime), Ok(mut checked)) = (mtime, CHECKED.lock()) {
        *checked = Some((real, mtime, tested));
    }
    tested
}

/// Run an assist invocation, refusing an untested Codex before it is sent
/// anything.
fn run_assist(tool: &str, program: &Path, inv: Invocation, timeout_ms: u64) -> AssistOutcome {
    if tool == "codex" && !codex_is_tested(program) {
        return AssistOutcome::failure("untested");
    }
    run_blocking(&program.display().to_string(), &inv.args, inv.stdin, timeout_ms.clamp(1000, ASSIST_MAX_TIMEOUT_MS))
}

/// Ask an AI CLI about `prompt`. Returns `{ ok: true, text }` (raw stdout) or
/// `{ ok: false, kind: "unauth" | "untested" | "timeout" | "error" }`. `model` names one of
/// the tool's listed models; Rust builds the flag (see `AssistTool::invocation`).
#[tauri::command]
pub async fn assist_run(app: AppHandle, tool: String, prompt: String, timeout_ms: u64, model: Option<String>) -> AssistOutcome {
    let Ok(dir) = app_data(&app) else { return AssistOutcome::failure("error") };
    blocking(move || match assist_command(&tool, &load_approved(&dir), &prompt, model.as_deref()) {
        Ok((program, inv)) => run_assist(&tool, &program, inv, timeout_ms),
        Err(e) => {
            eprintln!("[assist] {e}");
            AssistOutcome::failure("error")
        }
    })
    .await
    .unwrap_or_else(|e| {
        eprintln!("[assist] {e}");
        AssistOutcome::failure("error")
    })
}

const MAX_CUSTOM_ARGS: usize = 32;
const MAX_CUSTOM_ARGS_LEN: usize = 1000;

/// True when the alert shows `text` as it is: no control characters or line
/// separators (which push what follows out of sight), no direction marks
/// (which reorder it), no invisible characters.
fn shows_faithfully(text: &str) -> bool {
    !text.chars().any(|c| {
        c.is_control()
            || matches!(c,
                '\u{00AD}' | '\u{061C}' | '\u{180E}' | '\u{200B}'..='\u{200F}' | '\u{2028}'..='\u{202E}'
                | '\u{2060}'..='\u{2069}' | '\u{FEFF}')
    })
}

/// Arguments the confirmation can show faithfully, few and short enough to
/// fit the alert.
fn check_custom_args(args: &[String]) -> Result<(), String> {
    if args.len() > MAX_CUSTOM_ARGS || args.iter().map(String::len).sum::<usize>() > MAX_CUSTOM_ARGS_LEN {
        return Err("the command has too many arguments to confirm".into());
    }
    if !args.iter().all(|a| shows_faithfully(a)) {
        return Err("an argument holds a character the confirmation cannot show".into());
    }
    Ok(())
}

/// How the confirmation shows a command: the program, then each argument on
/// its own numbered line, single-quoted when it is empty or holds whitespace
/// or a quote, so what the user reads is what runs.
fn display_command(program: &Path, args: &[String]) -> String {
    let mut out = program.display().to_string();
    for (i, a) in args.iter().enumerate() {
        out.push_str(&format!("\n  {}. ", i + 1));
        if a.is_empty() || a.chars().any(|c| c.is_whitespace() || c == '\'' || c == '"') {
            out.push('\'');
            out.push_str(&a.replace('\'', r"'\''"));
            out.push('\'');
        } else {
            out.push_str(a);
        }
    }
    out
}

/// Set the custom AI command: the user picks the program in a native dialog,
/// then confirms the whole command in a native alert. Returns the approved
/// command, or None when either was cancelled.
#[tauri::command]
pub async fn assist_set_custom(app: AppHandle, args: Vec<String>, prompt_via: String) -> Result<Option<CustomAssistView>, String> {
    let dir = app_data(&app)?;
    let prompt_via = match prompt_via.as_str() {
        "stdin" => PromptVia::Stdin,
        "arg" => PromptVia::Arg,
        other => return Err(format!("unknown prompt channel {other:?}")),
    };
    check_custom_args(&args)?;
    blocking(move || {
        let Some(program) = pick_program(&app, "Choose the AI command") else { return Ok(None) };
        if !is_executable_file(&program) {
            return Err(format!("{} is not a program", program.display()));
        }
        if !shows_faithfully(&program.display().to_string()) {
            return Err("the program's name holds a character the confirmation cannot show".into());
        }
        let channel = match prompt_via {
            PromptVia::Stdin => "on standard input",
            PromptVia::Arg => "as its last argument",
        };
        let allowed = app
            .dialog()
            .message(format!(
                "Allow Translation Workbench to run this command?\n\n{}\n\nIt will receive the text you ask about {channel}. Allow it only if you trust this program.",
                display_command(&program, &args)
            ))
            .title("Run a custom AI command?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom("Allow".into(), "Cancel".into()))
            .blocking_show();
        if !allowed {
            return Ok(None);
        }
        let custom = CustomAssist { program, args, prompt_via };
        update_approved(&dir, |r| r.custom_assist = Some(custom.clone())).map_err(|e| e.to_string())?;
        Ok(Some(CustomAssistView::from(&custom)))
    })
    .await?
}

/// Forget the custom AI command.
#[tauri::command]
pub async fn assist_forget_custom(app: AppHandle) -> Result<(), String> {
    let dir = app_data(&app)?;
    blocking(move || update_approved(&dir, |r| r.custom_assist = None).map(|_| ()).map_err(|e| e.to_string())).await?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("wb-commands-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d.canonicalize().unwrap()
    }

    // ── export paths ──

    #[test]
    fn export_accepts_app_data_markdown_and_a_picked_docx() {
        let appdata = temp_dir("export-ok");
        let md = appdata.join("export-intermediate.md");
        std::fs::write(&md, "# x").unwrap();
        assert_eq!(check_export_paths(&appdata, &md, Path::new("/Users/u/Out.docx"), true), Ok(()));
        assert_eq!(check_export_paths(&appdata, &md, Path::new("/Users/u/Out.DOCX"), true), Ok(()));
    }

    #[test]
    fn export_refuses_markdown_outside_app_data() {
        let appdata = temp_dir("export-md");
        let elsewhere = temp_dir("export-md-elsewhere").join("x.md");
        std::fs::write(&elsewhere, "x").unwrap();
        assert!(check_export_paths(&appdata, &elsewhere, Path::new("/u/Out.docx"), true).is_err());
        // Missing file under app data.
        assert!(check_export_paths(&appdata, &appdata.join("nope.md"), Path::new("/u/Out.docx"), true).is_err());
    }

    #[test]
    #[cfg(unix)]
    fn export_refuses_markdown_reached_through_a_symlink_out_of_app_data() {
        let appdata = temp_dir("export-link");
        let elsewhere = temp_dir("export-link-elsewhere");
        std::fs::write(elsewhere.join("x.md"), "x").unwrap();
        std::os::unix::fs::symlink(&elsewhere, appdata.join("link")).unwrap();
        assert!(check_export_paths(&appdata, &appdata.join("link/x.md"), Path::new("/u/Out.docx"), true).is_err());
    }

    #[test]
    fn export_refuses_a_target_not_picked_or_not_docx() {
        let appdata = temp_dir("export-target");
        let md = appdata.join("e.md");
        std::fs::write(&md, "x").unwrap();
        assert!(check_export_paths(&appdata, &md, Path::new("/u/Out.docx"), false).is_err());
        assert!(check_export_paths(&appdata, &md, Path::new("/u/.zshrc"), true).is_err());
        assert!(check_export_paths(&appdata, &md, Path::new("Out.docx"), true).is_err());
    }

    #[test]
    fn a_reference_doc_must_be_the_bundled_one_or_a_pick() {
        let dir = temp_dir("reference");
        let bundled = dir.join("bundled.docx");
        let mine = dir.join("mine.docx");
        std::fs::write(&bundled, "b").unwrap();
        std::fs::write(&mine, "m").unwrap();
        assert_eq!(check_reference_doc(&mine, Some(&bundled), true), Ok(()));
        assert_eq!(check_reference_doc(&bundled, Some(&bundled), false), Ok(()));
        // The bundled file however it is spelled.
        std::fs::create_dir(dir.join("x")).unwrap();
        assert_eq!(check_reference_doc(&dir.join("x/../bundled.docx"), Some(&bundled), false), Ok(()));
        assert!(check_reference_doc(&mine, Some(&bundled), false).is_err(), "not picked");
        assert!(check_reference_doc(&mine, None, false).is_err(), "not picked, nothing bundled");
        assert!(check_reference_doc(&dir.join("gone.docx"), Some(&bundled), true).is_err(), "missing");
        assert!(check_reference_doc(Path::new("mine.docx"), Some(&bundled), true).is_err(), "relative");
    }

    #[test]
    #[cfg(unix)]
    fn a_link_to_the_bundled_reference_doc_is_not_the_bundled_one() {
        // Comparing real paths, a link to the bundled file is the bundled file
        // — harmless; the point is that a link elsewhere is not.
        let dir = temp_dir("reference-link");
        let bundled = dir.join("bundled.docx");
        let elsewhere = dir.join("elsewhere.docx");
        std::fs::write(&bundled, "b").unwrap();
        std::fs::write(&elsewhere, "e").unwrap();
        std::os::unix::fs::symlink(&elsewhere, dir.join("bundled-look.docx")).unwrap();
        assert!(check_reference_doc(&dir.join("bundled-look.docx"), Some(&bundled), false).is_err());
    }

    #[test]
    fn a_disc_folder_must_be_a_picked_folder() {
        let dir = temp_dir("disc");
        assert_eq!(check_disc_dir(&dir, true), Ok(()));
        assert!(check_disc_dir(&dir, false).is_err(), "not picked");
        assert!(check_disc_dir(&dir.join("gone"), true).is_err(), "missing");
        std::fs::write(dir.join("f"), "x").unwrap();
        assert!(check_disc_dir(&dir.join("f"), true).is_err(), "a file");
        assert!(check_disc_dir(Path::new("TLG"), true).is_err(), "relative");
    }

    // ── picks ──

    #[test]
    fn pick_status_says_why_a_stored_path_cannot_be_used() {
        let dir = temp_dir("pick-status");
        assert_eq!(pick_status_of(&dir, true), PickStatus::Ok);
        assert_eq!(pick_status_of(&dir.join("gone"), true), PickStatus::Missing);
        assert_eq!(pick_status_of(&dir, false), PickStatus::NotPicked);
        // Not picked wins over missing: the window learns nothing about a
        // path it was never given.
        assert_eq!(pick_status_of(&dir.join("gone"), false), PickStatus::NotPicked);
        assert_eq!(pick_status_of(Path::new("relative"), true), PickStatus::NotPicked);
        assert_eq!(serde_json::to_value(PickStatus::NotPicked).unwrap(), "not-picked");
    }

    #[test]
    fn a_folder_picked_shallow_is_not_picked_for_deep_use() {
        // A library or disc folder is read two levels down; a pick made
        // without recursive: true would open the folder and fail every chapter.
        let app = tauri::test::mock_builder().plugin(tauri_plugin_fs::init()).build(tauri::test::mock_context(tauri::test::noop_assets())).unwrap();
        let shallow = temp_dir("pick-shallow");
        let deep = temp_dir("pick-deep");
        app.fs_scope().allow_directory(&shallow, false).unwrap();
        app.fs_scope().allow_directory(&deep, true).unwrap();
        assert!(is_picked(app.handle(), &shallow, false));
        assert!(!is_picked(app.handle(), &shallow, true));
        assert!(is_picked(app.handle(), &deep, true));
        assert!(!is_picked(app.handle(), &temp_dir("pick-never"), false));
    }

    // ── pandoc ──

    #[test]
    fn a_picked_pandoc_that_will_not_run_is_not_replaced() {
        let approved = ApprovedPrograms { pandoc: Some("/no/such/pandoc".into()), ..Default::default() };
        assert_eq!(pandoc_program(&approved), (true, None));
    }

    #[test]
    fn version_line_reads_the_first_line() {
        // /bin/echo prints its argument: "--version".
        assert_eq!(version_line(Path::new("/bin/echo")).as_deref(), Some("--version"));
        assert_eq!(version_line(Path::new("/usr/bin/false")), None);
    }

    // ── Diogenes ──

    #[test]
    #[cfg(unix)]
    fn diogenes_runs_from_its_folder_with_only_the_disc_variable_added() {
        // A stand-in xml-export.pl run by the real system perl: it reports
        // its folder, the disc variable, and its arguments.
        let server = temp_dir("diogenes-server");
        std::fs::write(
            server.join("xml-export.pl"),
            "use Cwd; print getcwd(), \"|\", ($ENV{TLG_DIR} // ''), \"|\", ($ENV{PHI_DIR} // ''), \"|\", join(',', @ARGV);",
        )
        .unwrap();
        let out_dir = temp_dir("diogenes-out");
        let args = diogenes_export_args(Corpus::Tlg, "0086", &out_dir, LineMode::Lines).unwrap();
        let out = run_diogenes(Path::new("/usr/bin/perl"), &server, Corpus::Tlg, Path::new("/discs/TLG"), args, Duration::from_secs(20));
        assert_eq!(out.code, Some(0), "{out:?}");
        assert_eq!(out.stdout, format!("{}|/discs/TLG||-c,tlg,-n,0086,-o,{},-y", server.display(), out_dir.display()));
    }

    // ── AI assist ──

    #[test]
    fn the_custom_command_comes_only_from_the_record() {
        assert!(assist_command("custom", &ApprovedPrograms::default(), "p", None).is_err());
        let approved = ApprovedPrograms {
            custom_assist: Some(CustomAssist { program: "/usr/local/bin/llm".into(), args: vec!["-m".into(), "m".into()], prompt_via: PromptVia::Arg }),
            ..Default::default()
        };
        let (program, inv) = assist_command("custom", &approved, "--yolo", None).unwrap();
        assert_eq!(program, Path::new("/usr/local/bin/llm"));
        assert_eq!(inv.args, ["-m", "m", "--yolo"]);
        assert_eq!(inv.stdin, None);
        let stdin = ApprovedPrograms {
            custom_assist: Some(CustomAssist { program: "/x".into(), args: vec![], prompt_via: PromptVia::Stdin }),
            ..Default::default()
        };
        let (_, inv) = assist_command("custom", &stdin, "p", None).unwrap();
        assert_eq!((inv.args.len(), inv.stdin.as_deref()), (0, Some("p")));
    }

    #[test]
    fn a_custom_command_takes_no_model() {
        let approved = ApprovedPrograms {
            custom_assist: Some(CustomAssist { program: "/x".into(), args: vec![], prompt_via: PromptVia::Stdin }),
            ..Default::default()
        };
        assert!(assist_command("custom", &approved, "p", None).is_ok());
        assert!(assist_command("custom", &approved, "p", Some("")).is_ok());
        let err = assist_command("custom", &approved, "p", Some("--yolo")).unwrap_err();
        assert!(err.contains("model"), "{err}");
    }

    #[test]
    fn a_built_in_tool_refuses_a_model_off_its_list() {
        let err = assist_command("claude", &ApprovedPrograms::default(), "p", Some("--yolo")).unwrap_err();
        assert!(err.contains("model"), "{err}");
    }

    #[test]
    fn assist_refuses_a_program_path_for_a_tool() {
        assert!(assist_command("/bin/sh", &ApprovedPrograms::default(), "p", None).is_err());
        assert!(assist_command("", &ApprovedPrograms::default(), "p", None).is_err());
    }

    #[test]
    fn the_confirmation_shows_each_argument_unambiguously() {
        let args = ["-m".to_string(), "two words".into(), "".into(), "it's".into()];
        assert_eq!(
            display_command(Path::new("/bin/llm"), &args),
            "/bin/llm\n  1. -m\n  2. 'two words'\n  3. ''\n  4. 'it'\\''s'"
        );
    }

    #[test]
    fn custom_arguments_that_could_hide_from_the_confirmation_are_refused() {
        assert!(check_custom_args(&["-m".into(), "gpt".into()]).is_ok());
        assert!(check_custom_args(&[]).is_ok());
        for bad in [
            "a\nb", "a\rb", "x\u{202E}y", "x\u{2066}y", "x\u{200F}y", "x\u{061C}y", "\u{0}",
            "a\u{2028}b", "a\u{2029}b", "a\u{200B}b", "a\u{200D}b", "a\u{FEFF}b", "a\u{2060}b", "a\u{00AD}b",
        ] {
            assert!(check_custom_args(&[bad.to_string()]).is_err(), "{bad:?} accepted");
        }
        assert!(check_custom_args(&["x".repeat(MAX_CUSTOM_ARGS_LEN + 1)]).is_err());
        assert!(check_custom_args(&vec!["a".to_string(); MAX_CUSTOM_ARGS + 1]).is_err());
        assert!(shows_faithfully("/usr/local/bin/llm"));
        assert!(!shows_faithfully("/usr/local/bin/ll\u{2028}m"));
    }

    // ── the Word target ──

    #[test]
    fn only_a_target_rust_chose_in_its_save_dialog_is_accepted_and_only_once() {
        let targets = SaveTargets::default();
        let chosen = PathBuf::from("/Users/u/Out.docx");
        assert!(!targets.take(&chosen));
        targets.add(chosen.clone());
        assert!(!targets.take(Path::new("/Users/u/Other.docx")));
        assert!(targets.take(&chosen));
        assert!(!targets.take(&chosen), "a target is good for one export");
    }

    // ── Codex version gate ──

    /// A stand-in `codex` that prints `codex-cli <version>` for --version,
    /// echoes anything else, and logs every call to `calls`.
    #[cfg(unix)]
    fn fake_codex(bin: &Path, calls: &Path, version: &str) {
        use std::os::unix::fs::PermissionsExt;
        std::fs::write(
            bin,
            format!(
                "#!/bin/sh\necho \"$*\" >> '{}'\nif [ \"$1\" = --version ]; then echo 'codex-cli {version}'; else cat; fi\n",
                calls.display()
            ),
        )
        .unwrap();
        std::fs::set_permissions(bin, std::fs::Permissions::from_mode(0o755)).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn codex_version_is_asked_once_per_binary_and_again_after_an_upgrade() {
        let d = temp_dir("codex-version");
        let (bin, calls) = (d.join("codex"), d.join("calls"));
        fake_codex(&bin, &calls, "0.159.2");
        assert!(codex_is_tested(&bin));
        assert!(codex_is_tested(&bin));
        assert_eq!(std::fs::read_to_string(&calls).unwrap().lines().count(), 1, "--version ran once");
        // Upgraded in place: new contents, new modification time.
        std::thread::sleep(Duration::from_millis(20));
        fake_codex(&bin, &calls, "0.160.0");
        assert!(!codex_is_tested(&bin));
    }

    #[test]
    #[cfg(unix)]
    fn an_untested_codex_is_never_sent_the_prompt() {
        let d = temp_dir("codex-untested");
        let (bin, calls) = (d.join("codex"), d.join("calls"));
        fake_codex(&bin, &calls, "0.999.0");
        let inv = AssistTool::Codex.invocation("secret text", None).unwrap();
        let out = serde_json::to_value(run_assist("codex", &bin, inv, 5_000)).unwrap();
        assert_eq!(out, serde_json::json!({ "ok": false, "kind": "untested" }));
        assert_eq!(std::fs::read_to_string(&calls).unwrap(), "--version\n", "only --version ran");

        let d = temp_dir("codex-tested");
        let (bin, calls) = (d.join("codex"), d.join("calls"));
        fake_codex(&bin, &calls, "0.159.2");
        let inv = AssistTool::Codex.invocation("hello", None).unwrap();
        let out = serde_json::to_value(run_assist("codex", &bin, inv, 5_000)).unwrap();
        assert_eq!(out, serde_json::json!({ "ok": true, "text": "hello" }));
    }
}
