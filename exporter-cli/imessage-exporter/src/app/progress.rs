/*!
 Defines the export progress bar.
*/

use std::io::{self, Write};
use std::time::Duration;

use indicatif::{ProgressBar, ProgressDrawTarget, ProgressStyle};
use serde::{Deserialize, Serialize};

const TEMPLATE_DEFAULT: &str =
    "{spinner:.green} [{elapsed}] [{bar:.blue}] {human_pos}/{human_len} ({per_sec}, ETA: {eta})";
const TEMPLATE_BUSY: &str =
    "{spinner:.green} [{elapsed}] [{bar:.blue}] {human_pos}/{human_len} (ETA: N/A) {msg}";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub event_type: String,
    pub phase: String,
    pub current: u64,
    pub total: u64,
    pub percentage: f32,
    pub message: Option<String>,
    pub current_file: Option<String>,
}

/// Wrapper around indicatif's `ProgressBar` with specialized functionality
pub struct ExportProgress {
    pub bar: ProgressBar,
}

impl ExportProgress {
    /// Creates a new hidden progress bar with default style
    pub fn new() -> Self {
        let bar = ProgressBar::hidden();
        bar.set_style(
            ProgressStyle::default_bar()
                .template(TEMPLATE_DEFAULT)
                .unwrap()
                .progress_chars("#>-"),
        );

        Self { bar }
    }

    /// Starts the progress bar with the specified total length
    pub fn start(&self, length: u64) {
        self.bar.set_position(0);
        self.bar.enable_steady_tick(Duration::from_millis(100));
        self.bar.set_length(length);
        self.bar.set_draw_target(ProgressDrawTarget::stderr());

        // Emit scanning complete with total messages found
        self.emit_progress(
            "scanning",
            length,
            0,
            Some(format!("Found {} messages", length)),
            None,
        );
    }

    /// Transition to exporting phase
    pub fn start_exporting(&self) {
        let total = self.bar.length().unwrap_or(0);
        self.bar.set_position(0);
        self.emit_progress("exporting", 0, total, None, None);
    }

    /// Sets the progress bar to default style
    pub fn set_default_style(&self) {
        self.bar.set_style(
            ProgressStyle::default_bar()
                .template(TEMPLATE_DEFAULT)
                .unwrap()
                .progress_chars("#>-"),
        );
        self.bar.enable_steady_tick(Duration::from_millis(100));
    }

    /// Sets the progress bar to busy style with a message
    pub fn set_busy_style(&self, message: String) {
        self.bar.set_style(
            ProgressStyle::default_bar()
                .template(TEMPLATE_BUSY)
                .unwrap()
                .progress_chars("#>-"),
        );
        self.bar.set_message(message.clone());
        self.bar.enable_steady_tick(Duration::from_millis(250));

        let current = self.bar.position();
        let total = self.bar.length().unwrap_or(0);
        self.emit_progress("busy", current, total, Some(message), None);
    }

    /// Sets the position of the progress bar
    pub fn set_position(&self, pos: u64) {
        self.bar.set_position(pos);

        let total = self.bar.length().unwrap_or(0);
        self.emit_progress("exporting", pos, total, None, None);
    }

    /// Finishes the progress bar
    pub fn finish(&self) {
        self.bar.finish();

        let total = self.bar.length().unwrap_or(0);
        self.emit_progress("complete", total, total, None, None);
    }

    /// Update progress with current file information
    pub fn set_current_file(&self, file_name: &str) {
        let current = self.bar.position();
        let total = self.bar.length().unwrap_or(0);
        self.emit_progress(
            "exporting",
            current,
            total,
            None,
            Some(file_name.to_string()),
        );
    }

    /// Set attachment copying phase
    pub fn set_attachment_phase(&self, current: u64, total: u64) {
        self.bar.set_position(current);
        self.bar.set_length(total);
        self.emit_progress("copying-attachments", current, total, None, None);
    }

    /// Emit a JSON progress event to stdout
    fn emit_progress(
        &self,
        phase: &str,
        current: u64,
        total: u64,
        message: Option<String>,
        current_file: Option<String>,
    ) {
        let percentage = match phase {
            "scanning" => 0.0, // Always 0% during scanning
            "exporting" | "copying-attachments" => {
                if total > 0 {
                    (current as f32 / total as f32) * 100.0
                } else {
                    0.0
                }
            }
            _ => 0.0,
        };

        let event = ProgressEvent {
            event_type: "progress".to_string(),
            phase: phase.to_string(),
            current,
            total,
            percentage,
            message,
            current_file,
        };

        if let Ok(json) = serde_json::to_string(&event) {
            // Write directly to stdout and flush immediately
            if let Err(e) = writeln!(io::stdout(), "PROGRESS_JSON: {}", json) {}
            let _ = io::stdout().flush();

            // Also write to stderr for debugging
        }
    }
}

impl Default for ExportProgress {
    fn default() -> Self {
        Self::new()
    }
}
