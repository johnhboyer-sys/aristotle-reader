// The jobs Rust runs for the window, with every command line built here
// (workbench-design/sandboxing-plan.md). Approving a program approves every
// argument it accepts — `perl -e`, `pandoc --lua-filter` and an AI CLI's
// permission flags all run arbitrary code — so the window names a job and
// supplies data; it never supplies argv.
//
// Phase 1: the builders and checks, pure and tested. Nothing calls them yet;
// phase 2 replaces `run_program` and the free-form `assist_run` with commands
// built on these.

#![allow(dead_code)] // wired in phase 2

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

// ── pandoc ──────────────────────────────────────────────────────────────────

/// `pandoc -f markdown -t docx -o <docx> [--reference-doc <ref>] <md>` — the
/// same argv `pandocDocxArgs` (src/lib/export/pandoc.ts) built in the window.
pub fn pandoc_docx_args(md: &Path, docx: &Path, reference_doc: Option<&Path>) -> Vec<String> {
    let mut args: Vec<String> = ["-f", "markdown", "-t", "docx", "-o"].map(String::from).to_vec();
    args.push(docx.display().to_string());
    if let Some(r) = reference_doc {
        args.push("--reference-doc".into());
        args.push(r.display().to_string());
    }
    args.push(md.display().to_string());
    args
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
pub enum AssistTool {
    Claude,
    Codex,
    Gemini,
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
            "gemini" => Ok(Self::Gemini),
            _ => Err(format!("unknown assist tool {s:?}")),
        }
    }

    /// The name `command -v` looks for.
    pub fn bin_name(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
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
            Self::Gemini => vec![
                h(".gemini/bin/gemini"),
                h(".local/bin/gemini"),
                "/opt/homebrew/bin/gemini".into(),
                "/usr/local/bin/gemini".into(),
            ],
        }
    }

    /// The fixed flags from src/lib/assist/tools.ts, with the prompt placed as
    /// each tool reads it. Claude and Codex read it on stdin; Gemini takes it
    /// as the value of `-p`, a single argv element, so no shell ever parses it.
    pub fn invocation(self, prompt: &str) -> Invocation {
        let fixed = |a: &[&str]| a.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        match self {
            Self::Claude => Invocation {
                args: fixed(&["-p", "--output-format", "json", "--strict-mcp-config", "--mcp-config", r#"{"mcpServers":{}}"#]),
                stdin: Some(prompt.into()),
            },
            Self::Codex => Invocation {
                args: fixed(&["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "-c", "mcp_servers={}", "-"]),
                stdin: Some(prompt.into()),
            },
            Self::Gemini => Invocation {
                args: vec!["-p".into(), prompt.into()],
                stdin: None,
            },
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

    #[test]
    fn pandoc_argv_matches_the_window_builder() {
        let md = Path::new("/d/export-intermediate.md");
        let docx = Path::new("/u/Out.docx");
        assert_eq!(
            pandoc_docx_args(md, docx, None),
            ["-f", "markdown", "-t", "docx", "-o", "/u/Out.docx", "/d/export-intermediate.md"]
        );
        assert_eq!(
            pandoc_docx_args(md, docx, Some(Path::new("/u/ref.docx"))),
            ["-f", "markdown", "-t", "docx", "-o", "/u/Out.docx", "--reference-doc", "/u/ref.docx", "/d/export-intermediate.md"]
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
        let c = AssistTool::Claude.invocation("Translate");
        assert_eq!(c.args[0], "-p");
        assert_eq!(c.stdin.as_deref(), Some("Translate"));
        let x = AssistTool::Codex.invocation("Translate");
        assert_eq!(x.args.last().unwrap(), "-");
        assert_eq!(x.args[..2], ["exec", "--json"]);
        let g = AssistTool::Gemini.invocation("--yolo");
        // The prompt is -p's value, never a flag of its own.
        assert_eq!(g.args, ["-p", "--yolo"]);
        assert_eq!(g.stdin, None);
    }

    #[test]
    fn the_prompt_never_reaches_argv_for_stdin_tools() {
        for tool in [AssistTool::Claude, AssistTool::Codex] {
            let inv = tool.invocation("--dangerously-skip-permissions");
            assert!(!inv.args.iter().any(|a| a.contains("dangerously")), "{tool:?}");
        }
    }

    #[test]
    fn assist_tools_parse_only_known_names() {
        assert_eq!(AssistTool::parse("codex").unwrap().bin_name(), "codex");
        assert!(AssistTool::parse("/bin/sh").is_err());
        assert!(AssistTool::parse("custom").is_err());
    }

    #[test]
    fn candidate_paths_are_absolute() {
        let home = Path::new("/Users/someone");
        for tool in [AssistTool::Claude, AssistTool::Codex, AssistTool::Gemini] {
            assert!(tool.candidate_paths(home).iter().all(|p| p.is_absolute()), "{tool:?}");
        }
        assert_eq!(AssistTool::Claude.candidate_paths(home)[0], Path::new("/Users/someone/.claude/local/claude"));
    }
}
