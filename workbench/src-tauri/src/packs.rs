//! Lexicon packs — install, list, remove.
//!
//! The app ships with no dictionary at all. A pack is one language's COMPLETE
//! dictionary plus its COMPLETE morphology in a single .zip, built by
//! scripts/build_lexicon_pack.py and installed by the user from
//! Settings › Lexicon. That keeps the download small and lets someone take
//! only the language they work in.
//!
//! Installed layout, under the app-data directory:
//!
//!     packs/grc/pack.json          the manifest (format, entry count, …)
//!     packs/grc/lsj/<letter>.json  Liddell & Scott, sharded by initial letter
//!     packs/grc/short_defs.json    one-line senses (Greek only)
//!     packs/grc/morphology/greek-analyses.txt + .idt
//!     packs/lat/…                  the same shape, 'ls' shards
//!
//! Why unzip here rather than in the frontend: a pack is 127-225 MB unpacked,
//! and this streams it entry by entry to disk instead of materializing it in
//! the webview's memory.
//!
//! Two safety properties this file is responsible for:
//!
//!   1. NO PATH ESCAPE. A zip entry can name `../../../etc/passwd`; every
//!      entry here goes through `enclosed_name()`, which refuses anything that
//!      climbs out of the destination, and is then re-checked against the
//!      destination root. A pack is a file the user picked, but "the user
//!      picked it" is not evidence it was built by us.
//!   2. NO HALF-INSTALLED PACK. Extraction goes to a staging directory beside
//!      the target; the previous install is only replaced once extraction has
//!      fully succeeded. An interrupted install leaves the old pack working
//!      rather than a broken new one.

use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Pack layout version this build understands. A pack declaring anything else
/// is refused whole — reading an unknown layout half-way is worse than
/// declining it.
const SUPPORTED_FORMAT: u64 = 1;

/// The languages a pack may claim. Anything else is refused: the language id
/// becomes a directory name, and an unvetted one is a path-injection seam.
const KNOWN_LANGUAGES: [&str; 2] = ["grc", "lat"];

#[derive(Serialize, Clone)]
pub struct PackInfo {
    language: String,
    name: String,
    dictionary: String,
    entries: u64,
    /// Directory holding the dictionary shards, relative to the pack root.
    shard_dir: String,
    analyses_file: String,
    index_file: String,
    source: String,
    /// Absolute path of the installed pack, so the frontend can read from it.
    path: String,
    /// Installed size in bytes, for the settings pane.
    bytes: u64,
}

#[derive(Serialize)]
pub struct InstallOutcome {
    ok: bool,
    /// One plain sentence for the UI when `ok` is false.
    message: Option<String>,
    pack: Option<PackInfo>,
}

impl InstallOutcome {
    fn failure(message: impl Into<String>) -> Self {
        InstallOutcome { ok: false, message: Some(message.into()), pack: None }
    }
}

/// What we read out of a pack's manifest. Kept separate from PackInfo because
/// the manifest is UNTRUSTED input and PackInfo is what we vouch for.
struct Manifest {
    language: String,
    name: String,
    dictionary: String,
    entries: u64,
    shard_dir: String,
    analyses_file: String,
    index_file: String,
    source: String,
}

fn parse_manifest(text: &str) -> Result<Manifest, String> {
    let v: serde_json::Value = serde_json::from_str(text)
        .map_err(|_| "That file doesn't look like a lexicon pack.".to_string())?;
    let str_field = |key: &str| -> String {
        v.get(key).and_then(|x| x.as_str()).unwrap_or_default().to_string()
    };
    let language = str_field("language");
    if !KNOWN_LANGUAGES.contains(&language.as_str()) {
        return Err("That pack is for a language this version doesn't support.".into());
    }
    let format = v.get("format").and_then(|x| x.as_u64()).unwrap_or(0);
    if format != SUPPORTED_FORMAT {
        return Err("That pack was built for a different version of the app.".into());
    }
    // The shard directory becomes a path segment, so it may not contain a
    // separator or a parent reference.
    let shard_dir = str_field("shardDir");
    if shard_dir.is_empty() || shard_dir.contains('/') || shard_dir.contains('\\') || shard_dir.contains("..") {
        return Err("That pack's contents are laid out in a way this version can't read.".into());
    }
    Ok(Manifest {
        language,
        name: str_field("name"),
        dictionary: str_field("dictionary"),
        entries: v.get("entries").and_then(|x| x.as_u64()).unwrap_or(0),
        shard_dir,
        analyses_file: str_field("analysesFile"),
        index_file: str_field("indexFile"),
        source: str_field("source"),
    })
}

fn packs_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Couldn't find this app's data folder.".to_string())?
        .join("packs");
    fs::create_dir_all(&dir).map_err(|err| {
        eprintln!("[packs] could not create {}: {err}", dir.display());
        "Couldn't create the folder to install into.".to_string()
    })?;
    Ok(dir)
}

fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    let Ok(entries) = fs::read_dir(path) else { return 0 };
    for entry in entries.flatten() {
        match entry.metadata() {
            Ok(meta) if meta.is_dir() => total += dir_size(&entry.path()),
            Ok(meta) => total += meta.len(),
            Err(_) => {}
        }
    }
    total
}

fn pack_info_at(dir: &Path) -> Option<PackInfo> {
    let text = fs::read_to_string(dir.join("pack.json")).ok()?;
    let m = parse_manifest(&text).ok()?;
    Some(PackInfo {
        language: m.language,
        name: m.name,
        dictionary: m.dictionary,
        entries: m.entries,
        shard_dir: m.shard_dir,
        analyses_file: m.analyses_file,
        index_file: m.index_file,
        source: m.source,
        path: dir.to_string_lossy().into_owned(),
        bytes: dir_size(dir),
    })
}

/// Every installed pack. A directory that isn't a readable pack is skipped
/// rather than reported — leftovers must not break the settings pane.
#[tauri::command]
pub async fn list_lexicon_packs(app: AppHandle) -> Vec<PackInfo> {
    let Ok(root) = packs_root(&app) else { return Vec::new() };
    let Ok(entries) = fs::read_dir(&root) else { return Vec::new() };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            if let Some(info) = pack_info_at(&entry.path()) {
                out.push(info);
            }
        }
    }
    out.sort_by(|a, b| a.language.cmp(&b.language));
    out
}

/// Read the manifest out of a .zip without extracting anything else, so an
/// unsuitable pack is refused before a single byte hits the disk.
fn read_manifest_from_zip(zip_path: &Path) -> Result<Manifest, String> {
    let file = fs::File::open(zip_path).map_err(|err| {
        eprintln!("[packs] cannot open {}: {err}", zip_path.display());
        "That file couldn't be opened.".to_string()
    })?;
    let mut archive = zip::ZipArchive::new(file).map_err(|err| {
        eprintln!("[packs] not a readable zip {}: {err}", zip_path.display());
        "That file isn't a lexicon pack.".to_string()
    })?;
    let mut entry = archive
        .by_name("pack.json")
        .map_err(|_| "That file isn't a lexicon pack.".to_string())?;
    let mut text = String::new();
    io::Read::read_to_string(&mut entry, &mut text).map_err(|err| {
        eprintln!("[packs] cannot read pack.json: {err}");
        "That pack couldn't be read.".to_string()
    })?;
    parse_manifest(&text)
}

fn extract_all(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|_| "That file couldn't be opened.".to_string())?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|_| "That file isn't a lexicon pack.".to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|err| {
            eprintln!("[packs] unreadable entry {i}: {err}");
            "That pack is damaged — nothing was installed.".to_string()
        })?;

        // enclosed_name() returns None for anything that would escape the
        // destination (absolute paths, `..` segments). See the module header.
        let Some(relative) = entry.enclosed_name() else {
            eprintln!("[packs] refusing entry with an unsafe name: {}", entry.name());
            return Err("That pack contains an unexpected file — nothing was installed.".into());
        };
        let target = dest.join(&relative);
        // Belt and braces: even with enclosed_name(), confirm the resolved
        // target really is under the destination root.
        if !target.starts_with(dest) {
            eprintln!("[packs] refusing entry escaping the destination: {}", entry.name());
            return Err("That pack contains an unexpected file — nothing was installed.".into());
        }

        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|err| {
                eprintln!("[packs] mkdir {} failed: {err}", target.display());
                "Couldn't write the pack to disk.".to_string()
            })?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|err| {
                eprintln!("[packs] mkdir {} failed: {err}", parent.display());
                "Couldn't write the pack to disk.".to_string()
            })?;
        }
        let mut out = fs::File::create(&target).map_err(|err| {
            eprintln!("[packs] create {} failed: {err}", target.display());
            "Couldn't write the pack to disk.".to_string()
        })?;
        io::copy(&mut entry, &mut out).map_err(|err| {
            eprintln!("[packs] write {} failed: {err}", target.display());
            "Couldn't write the pack to disk — is there enough free space?".to_string()
        })?;
    }
    Ok(())
}

/// Install a pack from a .zip the user picked. Replaces any existing pack for
/// the same language.
#[tauri::command]
pub async fn install_lexicon_pack(app: AppHandle, zip_path: String) -> InstallOutcome {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_blocking(&handle, &zip_path))
        .await
        .unwrap_or_else(|err| {
            eprintln!("[packs] install task panicked: {err}");
            InstallOutcome::failure("The pack couldn't be installed.")
        })
}

fn install_blocking(app: &AppHandle, zip_path: &str) -> InstallOutcome {
    let zip_path = Path::new(zip_path);
    let manifest = match read_manifest_from_zip(zip_path) {
        Ok(m) => m,
        Err(message) => return InstallOutcome::failure(message),
    };

    let root = match packs_root(app) {
        Ok(r) => r,
        Err(message) => return InstallOutcome::failure(message),
    };
    let target = root.join(&manifest.language);
    // Staging sits beside the target so the final move is a rename within one
    // filesystem — see the module header on never leaving a half install.
    let staging = root.join(format!(".incoming-{}", manifest.language));
    let _ = fs::remove_dir_all(&staging);
    if let Err(err) = fs::create_dir_all(&staging) {
        eprintln!("[packs] could not create staging {}: {err}", staging.display());
        return InstallOutcome::failure("Couldn't create the folder to install into.");
    }

    if let Err(message) = extract_all(zip_path, &staging) {
        let _ = fs::remove_dir_all(&staging);
        return InstallOutcome::failure(message);
    }

    // Swap only now that the new copy is complete on disk.
    let previous = root.join(format!(".previous-{}", manifest.language));
    let _ = fs::remove_dir_all(&previous);
    let had_previous = target.exists();
    if had_previous {
        if let Err(err) = fs::rename(&target, &previous) {
            eprintln!("[packs] could not move the previous pack aside: {err}");
            let _ = fs::remove_dir_all(&staging);
            return InstallOutcome::failure("Couldn't replace the pack already installed.");
        }
    }
    if let Err(err) = fs::rename(&staging, &target) {
        eprintln!("[packs] could not move the new pack into place: {err}");
        // Put the old one back rather than leaving the user with neither.
        if had_previous {
            let _ = fs::rename(&previous, &target);
        }
        let _ = fs::remove_dir_all(&staging);
        return InstallOutcome::failure("Couldn't put the new pack in place.");
    }
    let _ = fs::remove_dir_all(&previous);

    match pack_info_at(&target) {
        Some(pack) => InstallOutcome { ok: true, message: None, pack: Some(pack) },
        None => InstallOutcome::failure("The pack installed but couldn't be read back."),
    }
}

/// Remove an installed pack. Removing something that isn't there succeeds —
/// the caller asked for it gone, and it is.
#[tauri::command]
pub async fn remove_lexicon_pack(app: AppHandle, language: String) -> bool {
    if !KNOWN_LANGUAGES.contains(&language.as_str()) {
        return false;
    }
    let Ok(root) = packs_root(&app) else { return false };
    let target = root.join(&language);
    if !target.exists() {
        return true;
    }
    match fs::remove_dir_all(&target) {
        Ok(()) => true,
        Err(err) => {
            eprintln!("[packs] could not remove {}: {err}", target.display());
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_well_formed_manifest() {
        let m = parse_manifest(
            r#"{"format":1,"language":"lat","name":"Latin","dictionary":"Lewis & Short",
                "entries":51674,"shardDir":"ls","analysesFile":"latin-analyses.txt",
                "indexFile":"latin-analyses.idt","source":"Perseus"}"#,
        )
        .expect("should parse");
        assert_eq!(m.language, "lat");
        assert_eq!(m.entries, 51674);
    }

    #[test]
    fn refuses_an_unknown_language() {
        assert!(parse_manifest(r#"{"format":1,"language":"zz","shardDir":"zz"}"#).is_err());
    }

    #[test]
    fn refuses_a_future_format() {
        assert!(parse_manifest(r#"{"format":99,"language":"lat","shardDir":"ls"}"#).is_err());
    }

    #[test]
    fn refuses_a_shard_dir_that_is_a_path() {
        for bad in ["../escape", "a/b", "..", ""] {
            let json = format!(r#"{{"format":1,"language":"lat","shardDir":"{bad}"}}"#);
            assert!(parse_manifest(&json).is_err(), "should refuse shardDir {bad:?}");
        }
    }

    #[test]
    fn refuses_something_that_is_not_json() {
        assert!(parse_manifest("not a pack at all").is_err());
    }

    /// Build a .zip in a temp dir from (name, contents) pairs.
    fn write_zip(dir: &Path, name: &str, entries: &[(&str, &str)]) -> PathBuf {
        use std::io::Write;
        let path = dir.join(name);
        let file = fs::File::create(&path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options: zip::write::FileOptions<'_, ()> =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for (entry_name, contents) in entries {
            zip.start_file(*entry_name, options).unwrap();
            zip.write_all(contents.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
        path
    }

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("packs-test-{tag}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn extracts_a_normal_pack_preserving_its_layout() {
        let dir = temp_dir("normal");
        let zip = write_zip(
            &dir,
            "pack.zip",
            &[
                ("pack.json", r#"{"format":1,"language":"lat","shardDir":"ls"}"#),
                ("ls/a.json", "{}"),
                ("morphology/latin-analyses.idt", "%index_start = ();"),
            ],
        );
        let dest = dir.join("out");
        fs::create_dir_all(&dest).unwrap();
        extract_all(&zip, &dest).expect("should extract");

        assert!(dest.join("pack.json").is_file());
        assert!(dest.join("ls/a.json").is_file());
        assert!(dest.join("morphology/latin-analyses.idt").is_file());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_an_entry_that_would_escape_the_destination() {
        // The zip-slip case: an entry naming its way out of the extraction
        // root. It must be refused whole, and nothing outside the destination
        // may be touched.
        let dir = temp_dir("escape");
        let zip = write_zip(
            &dir,
            "evil.zip",
            &[
                ("pack.json", r#"{"format":1,"language":"lat","shardDir":"ls"}"#),
                ("../escaped.txt", "should never be written"),
            ],
        );
        let dest = dir.join("out");
        fs::create_dir_all(&dest).unwrap();

        let result = extract_all(&zip, &dest);
        assert!(result.is_err(), "an escaping entry must be refused");
        assert!(!dir.join("escaped.txt").exists(), "nothing may be written outside the destination");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn reads_the_manifest_out_of_a_zip_without_extracting() {
        let dir = temp_dir("manifest");
        let zip = write_zip(
            &dir,
            "pack.zip",
            &[(
                "pack.json",
                r#"{"format":1,"language":"grc","dictionary":"Liddell & Scott",
                    "entries":116728,"shardDir":"lsj"}"#,
            )],
        );
        let m = read_manifest_from_zip(&zip).expect("should read");
        assert_eq!(m.language, "grc");
        assert_eq!(m.entries, 116728);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_a_zip_with_no_manifest_at_all() {
        let dir = temp_dir("nomanifest");
        let zip = write_zip(&dir, "plain.zip", &[("readme.txt", "just a zip")]);
        assert!(read_manifest_from_zip(&zip).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
