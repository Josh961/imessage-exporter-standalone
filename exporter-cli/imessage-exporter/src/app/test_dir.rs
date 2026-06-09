//! Per-test scratch directories under [`std::env::temp_dir`].
//!
//! Many tests build a fake [`Options`](crate::app::options::Options) and then
//! construct an exporter, which opens an `orphaned.<ext>` file under
//! `export_path`. A shared path (such as `/tmp`) collides between parallel
//! test processes and leaks state across runs, so every caller gets a fresh,
//! uniquely-named directory instead.

use std::{
    env::temp_dir,
    fs::{create_dir_all, read_dir, remove_dir_all},
    path::PathBuf,
    process,
    sync::{
        OnceLock,
        atomic::{AtomicU64, Ordering},
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

/// Prefix shared by every directory this module creates, so the sweep can
/// recognize its own entries without touching unrelated temp files.
const PREFIX: &str = "imessage-exporter-test-";

/// Sweep entries older than this on first call per process.
const STALE_AFTER: Duration = Duration::from_secs(60 * 60);

/// Build a fresh, uniquely-named directory under [`temp_dir`] and return its
/// path. `label` is a human-readable suffix that helps when manually
/// inspecting leftover entries.
pub fn unique_test_dir(label: &str) -> PathBuf {
    static SWEEP: OnceLock<()> = OnceLock::new();
    SWEEP.get_or_init(sweep_stale_test_dirs);

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = temp_dir().join(format!(
        "{PREFIX}{}-{nanos}-{counter}-{label}",
        process::id(),
    ));
    create_dir_all(&path).expect("create unique test dir");
    path
}

/// Remove leftover [`PREFIX`]-tagged directories whose mtime is older than
/// [`STALE_AFTER`].
fn sweep_stale_test_dirs() {
    let Ok(entries) = read_dir(temp_dir()) else {
        return;
    };
    let cutoff = SystemTime::now()
        .checked_sub(STALE_AFTER)
        .unwrap_or(UNIX_EPOCH);
    for entry in entries.flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !name.starts_with(PREFIX) {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .map(|m| m < cutoff)
            .unwrap_or(false);
        if stale {
            let _ = remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_test_dir_is_unique_per_call() {
        let a = unique_test_dir("uniq-a");
        let b = unique_test_dir("uniq-b");
        assert_ne!(a, b);
        assert!(a.is_dir());
        assert!(b.is_dir());
    }

    #[test]
    fn unique_test_dir_uses_expected_prefix() {
        let dir = unique_test_dir("prefix-check");
        let name = dir.file_name().unwrap().to_string_lossy().into_owned();
        assert!(name.starts_with(PREFIX), "actual name: {name}");
        assert!(name.ends_with("prefix-check"), "actual name: {name}");
    }
}
