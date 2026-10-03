// The jobs Rust runs for the window, with every command line built here
// (workbench-design/sandboxing-plan.md). Approving a program approves every
// argument it accepts — `perl -e`, `pandoc --lua-filter` and an AI CLI's
// permission flags all run arbitrary code — so the window names a job and
// supplies data; it never supplies argv.
//
// The builders and checks here are pure and tested; the commands that use
// them live in commands.rs.

use std::path::{Component, Path, PathBuf};

/// True when `path` is absolute, has no `..` component, and lies under
/// `root`. Lexical on purpose: a job's input file may not exist yet, and
/// `..` is refused outright rather than resolved, so a crafted path cannot
/// climb out of `root`.
pub fn is_inside(path: &Path, root: &Path) -> bool {
    path.is_absolute()
        && path.components().all(|c| matches!(c, Component::RootDir | Component::Normal(_) | Component::Prefix(_)))
        && path.starts_with(root)
        && path != root
}

/// Where `path` really is: symlinks resolved. A file not yet created is
/// resolved through its parent, which must exist. None when neither resolves.
pub fn real_path(path: &Path) -> Option<PathBuf> {
    if let Ok(p) = path.canonicalize() {
        return Some(p);
    }
    let name = match path.components().next_back()? {
        Component::Normal(n) => n.to_owned(),
        _ => return None,
    };
    Some(path.parent()?.canonicalize().ok()?.join(name))
}

/// `is_inside` on the real locations of both: a symlink under `root` that
/// points out of it is outside. Lexical `..` is still refused first, before
/// anything touches the disk.
pub fn is_really_inside(path: &Path, root: &Path) -> bool {
    if !is_inside(path, root) {
        return false;
    }
    match (real_path(path), root.canonicalize()) {
        (Some(p), Ok(r)) => is_inside(&p, &r),
        _ => false,
    }
}

// ── pandoc ──────────────────────────────────────────────────────────────────

/// `pandoc --sandbox -f markdown -t docx -o <docx> [--reference-doc <ref>] <md>`
/// — the same argv `pandocDocxArgs` (src/lib/export/pandoc.ts) builds.
///
/// `--sandbox` (pandoc 2.15+) lets pandoc read only the files named here, so
/// an image or include in the markdown (from imported text) cannot pull
/// another file into the .docx. Checked with pandoc 3.10 and the bundled
/// reference.docx (2026-10-03): the output is the same but for the document's
/// created/modified dates, which the sandbox hides, so they read 1970-01-01.
pub fn pandoc_docx_args(md: &Path, docx: &Path, reference_doc: Option<&Path>) -> Vec<String> {
    let mut args: Vec<String> = ["--sandbox", "-f", "markdown", "-t", "docx", "-o"].map(String::from).to_vec();
    args.push(docx.display().to_string());
    if let Some(r) = reference_doc {
        args.push("--reference-doc".into());
        args.push(r.display().to_string());
    }
    args.push(md.display().to_string());
    args
}

// ── Codex version ───────────────────────────────────────────────────────────

/// The codex-cli versions the `--disable` list in [`AssistTool::invocation`]
/// was checked against, by the test its doc comment describes. Add a version
/// only after repeating that test on it. The window's copy
/// (src/lib/assist/messages.ts) is pinned to this list by a test.
pub const TESTED_CODEX_VERSIONS: &[&str] = &["0.159.2"];

/// True when `stdout` of `codex --version` is exactly `codex-cli <v>` for a
/// tested `v`. Anything else, an unreadable answer included, is untested.
pub fn is_tested_codex(stdout: &str) -> bool {
    stdout.trim().strip_prefix("codex-cli ").is_some_and(|v| TESTED_CODEX_VERSIONS.contains(&v))
}

// ── Diogenes' xml-export.pl ─────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Corpus {
    Tlg,
    Phi,
}

impl Corpus {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "tlg" => Ok(Self::Tlg),
            "phi" => Ok(Self::Phi),
            _ => Err(format!("unknown corpus {s:?}")),
        }
    }
    fn flag(self) -> &'static str {
        match self {
            Self::Tlg => "tlg",
            Self::Phi => "phi",
        }
    }
    /// The environment variable that tells Diogenes where the disc is.
    pub fn disc_env_var(self) -> &'static str {
        match self {
            Self::Tlg => "TLG_DIR",
            Self::Phi => "PHI_DIR",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LineMode {
    /// Neither switch: Diogenes' own judgment.
    Auto,
    /// `-y`: keep verse line numbers.
    Lines,
    /// `-Y`: prose.
    Prose,
}

impl LineMode {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "auto" => Ok(Self::Auto),
            "lines" => Ok(Self::Lines),
            "prose" => Ok(Self::Prose),
            _ => Err(format!("unknown line mode {s:?}")),
        }
    }
    /// The folder each mode's exports are cached in: the same work exported
    /// as lines and as prose are different texts.
    pub fn name(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Lines => "lines",
            Self::Prose => "prose",
        }
    }
}

/// Where Diogenes' server folder (the one holding xml-export.pl) is installed,
/// best first. Moved from `diogenesServerCandidates` (src/lib/corpus/
/// discExport.ts). macOS is verified; the others are the documented install
/// paths, untested.
pub fn diogenes_server_candidates() -> Vec<PathBuf> {
    let c: &[&str] = if cfg!(target_os = "macos") {
        &["/Applications/Diogenes.app/Contents/server"]
    } else if cfg!(windows) {
        &["C:/Program Files/Diogenes/resources/app/server", "C:/Program Files (x86)/Diogenes/resources/app/server"]
    } else {
        &["/usr/share/diogenes/server", "/opt/diogenes/server"]
    };
    c.iter().map(PathBuf::from).collect()
}

/// perl interpreters to try, best first. macOS and Linux: the system perl,
/// which Diogenes itself uses there. Windows: UNVERIFIED guesses at where
/// Diogenes for Windows ships its own perl, relative to its server folder.
pub fn perl_candidates(server: &Path) -> Vec<PathBuf> {
    if !cfg!(windows) {
        return vec!["/usr/bin/perl".into()];
    }
    let parent = server.parent().unwrap_or(server);
    vec![
        parent.join("perl/perl/bin/perl.exe"),
        parent.join("strawberry/perl/bin/perl.exe"),
        server.join("perl/bin/perl.exe"),
    ]
}

/// `xml-export.pl -c <corpus> -n <author> -o <out> [-y|-Y]` — the argv
/// `buildDiscExportCommand` (src/lib/corpus/discExport.ts) built. The author
/// must be exactly four digits: it is the one free-text field, and a value
/// starting with `-` would otherwise reach perl as a switch.
pub fn diogenes_export_args(corpus: Corpus, author: &str, out_dir: &Path, line_mode: LineMode) -> Result<Vec<String>, String> {
    if author.len() != 4 || !author.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("author number must be four digits, got {author:?}"));
    }
    let mut args: Vec<String> = vec![
        "xml-export.pl".into(),
        "-c".into(),
        corpus.flag().into(),
        "-n".into(),
        author.into(),
        "-o".into(),
        out_dir.display().to_string(),
    ];
    match line_mode {
        LineMode::Auto => {}
        LineMode::Lines => args.push("-y".into()),
        LineMode::Prose => args.push("-Y".into()),
    }
    Ok(args)
}

// ── AI assist CLIs ──────────────────────────────────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
/// No Gemini: John disabled it on 2026-10-02 until its own tools can be
/// switched off and that is tested — no gemini was installed where the other
/// CLIs were checked. Its untested invocation was `gemini -p <prompt>`, with
/// candidates ~/.gemini/bin, ~/.local/bin, /opt/homebrew/bin, /usr/local/bin.
pub enum AssistTool {
    Claude,
    Codex,
}

/// What to run: the argv after the program, and what (if anything) goes on stdin.
#[derive(Debug, PartialEq, Eq)]
pub struct Invocation {
    pub args: Vec<String>,
    pub stdin: Option<String>,
}

impl AssistTool {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "claude" => Ok(Self::Claude),
            "codex" => Ok(Self::Codex),
            _ => Err(format!("unknown assist tool {s:?}")),
        }
    }

    /// The name `command -v` looks for.
    pub fn bin_name(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }

    /// Where each tool's installer puts it, tried in order before `command -v`.
    /// Moved from `candidatePaths` in src/lib/assist/tools.ts.
    pub fn candidate_paths(self, home: &Path) -> Vec<PathBuf> {
        let h = |rel: &str| home.join(rel);
        match self {
            Self::Claude => vec![
                h(".claude/local/claude"),
                h(".local/bin/claude"),
                "/opt/homebrew/bin/claude".into(),
                "/usr/local/bin/claude".into(),
            ],
            Self::Codex => vec![
                "/opt/homebrew/bin/codex".into(),
                h(".local/bin/codex"),
                "/usr/local/bin/codex".into(),
                h(".codex/bin/codex"),
            ],
        }
    }

    /// Each tool's flags, with its own tools switched off, and the prompt
    /// placed as the tool reads it: both read it on stdin, so no shell ever
    /// parses it.
    ///
    /// Tools off, because a prompt carries text from the page — a hostile
    /// source document could ask the CLI to run something, and the user's own
    /// CLI settings may allow it. Each set was checked by asking the CLI to
    /// run a command, read a file outside its folder, write a file and fetch
    /// a page, with and without these flags (2026-10-01):
    ///
    /// - claude 2.1.286: with `-p` alone it ran `touch`; with `--tools ""` it
    ///   has no tools and did nothing. `--setting-sources ""` loads no user,
    ///   project or local settings, so their hooks and plugins stay off (the
    ///   user's SessionEnd hook ran without it, not with it; sign-in still
    ///   works). Managed (admin-installed) settings still load, by Claude's
    ///   design; no flag skips them, and nothing in a prompt triggers them.
    ///   The MCP flags keep the user's MCP servers from starting.
    /// - codex-cli 0.159.2: `--sandbox read-only` alone still ran a shell
    ///   command. With `code_mode_host` off every remaining tool, apply_patch
    ///   and web included, fails closed; the other switches remove the tools
    ///   that act outside the sandbox. `--ignore-user-config` drops the user's
    ///   config.toml (its MCP servers, hooks, profiles); auth still works. A
    ///   Codex that does not know one of these names refuses to start, which
    ///   fails closed to the clipboard. But `--disable` is a denylist: a later
    ///   Codex with a new tool on by default would pass it, so only the
    ///   versions in [`TESTED_CODEX_VERSIONS`] are run at all (commands.rs).
    ///
    /// `model` must be one of [`Self::models`] (None or empty: the CLI's own
    /// default). Rust adds the `--model` flag itself; anything off the list is
    /// refused, so a value that looks like a flag never reaches argv.
    pub fn invocation(self, prompt: &str, model: Option<&str>) -> Result<Invocation, String> {
        let model = match model {
            None | Some("") => None,
            Some(m) if self.models().contains(&m) => Some(m),
            Some(m) => return Err(format!("{m:?} is not a {} model this app offers", self.bin_name())),
        };
        let fixed = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let mut inv = match self {
            Self::Claude => Invocation {
                args: fixed(&[
                    "-p", "--output-format", "json",
                    "--tools", "",
                    "--setting-sources", "",
                    "--strict-mcp-config", "--mcp-config", r#"{"mcpServers":{}}"#,
                ]),
                stdin: Some(prompt.into()),
            },
            Self::Codex => Invocation {
                args: fixed(&[
                    "exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only",
                    "--ignore-user-config", "-c", "mcp_servers={}", "-c", r#"web_search="disabled""#,
                    "--disable", "shell_tool", "--disable", "unified_exec", "--disable", "code_mode_host",
                    "--disable", "apps", "--disable", "plugins", "--disable", "browser_use",
                    "--disable", "computer_use", "--disable", "in_app_browser", "--disable", "image_generation",
                    "--disable", "multi_agent", "--disable", "goals", "--disable", "view_image",
                    "--disable", "sleep_tool",
                    "-",
                ]),
                stdin: Some(prompt.into()),
            },
        };
        if let Some(m) = model {
            // Before Codex's trailing `-` (read the prompt from stdin); Claude
            // takes flags in any order.
            let at = if self == Self::Codex { inv.args.len() - 1 } else { inv.args.len() };
            inv.args.splice(at..at, ["--model".to_string(), m.to_string()]);
        }
        Ok(inv)
    }

    /// The models the window may name, each checked against the installed CLI
    /// (claude 2.1.287, codex-cli 0.159.2, 2026-10-02) with the flags above:
    /// Claude's aliases resolve to the current model of each family; Codex's
    /// are the models its own model cache lists. An unknown name fails in
    /// both CLIs. The window's copy (src/lib/assist/models.ts) is pinned to
    /// this list by a test.
    pub fn models(self) -> &'static [&'static str] {
        match self {
            Self::Claude => &["fable", "opus", "sonnet", "haiku"],
            Self::Codex => &[
                "gpt-6.1-sol", "gpt-6-sol", "gpt-6-astra", "gpt-6-luna",
                "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5",
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_inside_accepts_a_file_under_the_root() {
        assert!(is_inside(Path::new("/a/data/export.md"), Path::new("/a/data")));
        assert!(is_inside(Path::new("/a/data/x/y.md"), Path::new("/a/data")));
    }

    #[test]
    fn is_inside_refuses_escapes_and_lookalikes() {
        let root = Path::new("/a/data");
        assert!(!is_inside(Path::new("/a/data/../etc/passwd"), root));
        // A mid-path `.` is not refused: Rust's parser drops it, so
        // `/a/data/./x.md` is `/a/data/x.md` — genuinely inside.
        assert!(is_inside(Path::new("/a/data/./x.md"), root));
        assert!(!is_inside(Path::new("/a/database/x.md"), root)); // shares a prefix, not a parent
        assert!(!is_inside(Path::new("data/x.md"), root)); // relative
        assert!(!is_inside(Path::new("/a/data"), root)); // the root itself is not a file in it
        assert!(!is_inside(Path::new("/b/x.md"), root));
    }

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("wb-jobs-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    #[cfg(unix)]
    fn a_symlink_out_of_the_root_is_outside() {
        let base = temp_dir("symlink");
        let root = base.join("appdata");
        let outside = base.join("elsewhere");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.md"), "x").unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        std::os::unix::fs::symlink(outside.join("secret.md"), root.join("file-link.md")).unwrap();
        // Lexically inside, really outside.
        assert!(is_inside(&root.join("link/secret.md"), &root));
        assert!(!is_really_inside(&root.join("link/secret.md"), &root));
        assert!(!is_really_inside(&root.join("file-link.md"), &root));
        // A file not yet created, under a symlinked folder.
        assert!(!is_really_inside(&root.join("link/new.docx"), &root));
    }

    #[test]
    fn a_real_file_and_a_file_not_yet_created_are_inside() {
        // The positive control, through macOS's /var -> /private/var symlink
        // on the temp dir itself: the root resolves the same way as the path.
        let root = temp_dir("inside");
        std::fs::write(root.join("export.md"), "x").unwrap();
        assert!(is_really_inside(&root.join("export.md"), &root));
        assert!(is_really_inside(&root.join("not-yet.md"), &root));
        std::fs::create_dir_all(root.join("corpus")).unwrap();
        assert!(is_really_inside(&root.join("corpus/new.xml"), &root));
    }

    #[test]
    fn a_path_whose_parent_is_missing_is_outside() {
        let root = temp_dir("noparent");
        assert!(!is_really_inside(&root.join("no/such/dir/x.md"), &root));
        assert!(!is_really_inside(&root.join("../x.md"), &root));
    }

    #[test]
    fn claude_runs_with_no_tools() {
        let args = AssistTool::Claude.invocation("x", None).unwrap().args;
        let i = args.iter().position(|a| a == "--tools").expect("--tools");
        assert_eq!(args[i + 1], "", "--tools must be followed by an empty list");
        assert!(args.iter().any(|a| a == "--strict-mcp-config"));
        // No user, project or local settings: their hooks and plugins stay off.
        let i = args.iter().position(|a| a == "--setting-sources").expect("--setting-sources");
        assert_eq!(args[i + 1], "", "--setting-sources must be followed by an empty list");
    }

    #[test]
    fn codex_runs_with_its_tools_switched_off() {
        let args = AssistTool::Codex.invocation("x", None).unwrap().args;
        let disabled: Vec<&str> = args
            .windows(2)
            .filter(|w| w[0] == "--disable")
            .map(|w| w[1].as_str())
            .collect();
        for feature in ["shell_tool", "unified_exec", "code_mode_host", "apps", "plugins", "browser_use", "computer_use"] {
            assert!(disabled.contains(&feature), "{feature} not disabled");
        }
        assert!(args.windows(2).any(|w| w == ["--sandbox", "read-only"]));
        assert!(args.windows(2).any(|w| w == ["-c", r#"web_search="disabled""#]));
        assert!(args.iter().any(|a| a == "--ignore-user-config"));
        assert!(!args.iter().any(|a| a.contains("dangerously") || a == "--enable"));
    }

    #[test]
    fn only_a_tested_codex_version_passes() {
        assert!(is_tested_codex("codex-cli 0.159.2\n"));
        for out in ["codex-cli 0.160.0\n", "codex-cli 0.159.20", "codex-cli 0.159", "0.159.2", "", "codex-cli 0.159.2\ncodex-cli 9"] {
            assert!(!is_tested_codex(out), "{out:?} passed");
        }
    }

    #[test]
    fn pandoc_argv_matches_the_window_builder() {
        let md = Path::new("/d/export-intermediate.md");
        let docx = Path::new("/u/Out.docx");
        assert_eq!(
            pandoc_docx_args(md, docx, None),
            ["--sandbox", "-f", "markdown", "-t", "docx", "-o", "/u/Out.docx", "/d/export-intermediate.md"]
        );
        assert_eq!(
            pandoc_docx_args(md, docx, Some(Path::new("/u/ref.docx"))),
            ["--sandbox", "-f", "markdown", "-t", "docx", "-o", "/u/Out.docx", "--reference-doc", "/u/ref.docx", "/d/export-intermediate.md"]
        );
    }

    #[test]
    fn diogenes_argv_matches_the_window_builder() {
        let out = Path::new("/d/corpus/disc-export/lines");
        assert_eq!(
            diogenes_export_args(Corpus::Tlg, "0086", out, LineMode::Lines).unwrap(),
            ["xml-export.pl", "-c", "tlg", "-n", "0086", "-o", "/d/corpus/disc-export/lines", "-y"]
        );
        assert_eq!(
            diogenes_export_args(Corpus::Phi, "0474", out, LineMode::Prose).unwrap().last().unwrap(),
            "-Y"
        );
        assert_eq!(diogenes_export_args(Corpus::Tlg, "0086", out, LineMode::Auto).unwrap().len(), 7);
    }

    #[test]
    fn diogenes_refuses_anything_but_four_digits() {
        let out = Path::new("/d/x");
        for bad in ["", "86", "00860", "-e1;", "0x86", "٠٠٨٦"] {
            assert!(diogenes_export_args(Corpus::Tlg, bad, out, LineMode::Auto).is_err(), "{bad:?} accepted");
        }
    }

    #[test]
    fn corpus_and_line_mode_parse_only_known_names() {
        assert_eq!(Corpus::parse("phi").unwrap().disc_env_var(), "PHI_DIR");
        assert!(Corpus::parse("TLG").is_err());
        assert_eq!(LineMode::parse("auto").unwrap(), LineMode::Auto);
        assert!(LineMode::parse("-y").is_err());
    }

    #[test]
    fn assist_invocations_match_the_window_specs() {
        let c = AssistTool::Claude.invocation("Translate", None).unwrap();
        assert_eq!(c.args[0], "-p");
        assert_eq!(c.stdin.as_deref(), Some("Translate"));
        let x = AssistTool::Codex.invocation("Translate", None).unwrap();
        assert_eq!(x.args.last().unwrap(), "-");
        assert_eq!(x.args[..2], ["exec", "--json"]);
    }

    #[test]
    fn the_prompt_never_reaches_argv_for_stdin_tools() {
        for tool in [AssistTool::Claude, AssistTool::Codex] {
            let inv = tool.invocation("--dangerously-skip-permissions", None).unwrap();
            assert!(!inv.args.iter().any(|a| a.contains("dangerously")), "{tool:?}");
        }
    }

    #[test]
    fn assist_tools_parse_only_known_names() {
        assert_eq!(AssistTool::parse("codex").unwrap().bin_name(), "codex");
        assert!(AssistTool::parse("/bin/sh").is_err());
        assert!(AssistTool::parse("custom").is_err());
        // Disabled until its own tools can be switched off and that is tested.
        assert!(AssistTool::parse("gemini").is_err());
    }

    #[test]
    fn candidate_paths_are_absolute() {
        let home = Path::new("/Users/someone");
        for tool in [AssistTool::Claude, AssistTool::Codex] {
            assert!(tool.candidate_paths(home).iter().all(|p| p.is_absolute()), "{tool:?}");
        }
        assert_eq!(AssistTool::Claude.candidate_paths(home)[0], Path::new("/Users/someone/.claude/local/claude"));
    }

    // ── the model the window names ──

    #[test]
    fn a_listed_model_becomes_rusts_own_flag() {
        let c = AssistTool::Claude.invocation("p", Some("sonnet")).unwrap();
        assert!(c.args.windows(2).any(|w| w == ["--model", "sonnet"]), "{:?}", c.args);
        let x = AssistTool::Codex.invocation("p", Some("gpt-6-luna")).unwrap();
        assert!(x.args.windows(2).any(|w| w == ["--model", "gpt-6-luna"]), "{:?}", x.args);
        // Codex still reads the prompt from stdin: `-` stays last.
        assert_eq!(x.args.last().unwrap(), "-");
    }

    #[test]
    fn no_model_means_no_flag() {
        for tool in [AssistTool::Claude, AssistTool::Codex] {
            for model in [None, Some("")] {
                let inv = tool.invocation("p", model).unwrap();
                assert!(!inv.args.iter().any(|a| a == "--model"), "{tool:?} {model:?}");
            }
        }
    }

    #[test]
    fn a_model_off_the_list_is_refused() {
        for tool in [AssistTool::Claude, AssistTool::Codex] {
            for bad in [
                "--yolo",
                "--dangerously-skip-permissions",
                "-p",
                "sonnet --tools Bash",
                " sonnet",
                "sonnet\n",
                "SONNET",
                "no-such-model",
                // Substrings and extensions of listed names: only an exact
                // match may pass.
                "son",
                "opus-",
                "gpt-6",
                "gpt-6-luna-x",
            ] {
                assert!(tool.invocation("p", Some(bad)).is_err(), "{tool:?} accepted {bad:?}");
            }
        }
        // Each tool's list is its own.
        assert!(AssistTool::Claude.invocation("p", Some("gpt-6-luna")).is_err());
        assert!(AssistTool::Codex.invocation("p", Some("sonnet")).is_err());
    }

    #[test]
    fn every_listed_model_is_a_plain_name() {
        for tool in [AssistTool::Claude, AssistTool::Codex] {
            assert!(!tool.models().is_empty(), "{tool:?}");
            for m in tool.models() {
                assert!(!m.starts_with('-'), "{m}");
                assert!(m.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '.'), "{m}");
            }
        }
    }
}
