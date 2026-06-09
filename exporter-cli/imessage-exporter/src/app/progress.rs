/*!
 Defines the export progress bar.
*/

use std::{
    cell::{Cell, RefCell},
    fmt::Display,
    io::{self, Write},
    time::Instant,
};

use serde::{Deserialize, Serialize};

const BAR_WIDTH: usize = 20;
const BAR_FILL: char = '#';
const BAR_ARROW: char = '>';
const BAR_EMPTY: char = ' ';

const HUMAN_COUNT_THRESHOLDS: [(u64, &str); 5] = [
    (1_000_000_000_000, "T"), // trillion
    (1_000_000_000, "B"),     // billion
    (1_000_000, "M"),         // million
    (1_000, "k"),             // thousand
    (0, ""),                  // no suffix
];

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

/// Format a number with comma separators
fn format_with_commas(n: u64) -> String {
    let s = n.to_string();
    let mut result = String::with_capacity(s.len() + s.len() / 3);
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            result.push(',');
        }
        result.push(c);
    }
    result
}

/// Format a rate as a human-readable string with appropriate suffix
fn format_human_rate(rate: f64) -> String {
    let rate_u64 = rate as u64;
    for &(threshold, suffix) in &HUMAN_COUNT_THRESHOLDS {
        if rate_u64 >= threshold && threshold > 0 {
            let scaled = rate / threshold as f64;
            return format!("{scaled:.1}{suffix}");
        }
    }
    format!("{rate:.1}")
}

/// Bespoke progress bar for iMessage exports
///
/// Uses interior mutability so that `set_busy_style` and `set_default_style`
/// can be called from `&self` contexts (e.g. `format_attachment`).
///
/// When `enabled` is `false`, every public method is a no-op so that
/// non-terminal stderr (e.g. piped to a log file) stays free of the
/// `\r`-rewrite and ANSI escape spam the bar would otherwise emit.
pub struct ExportProgress {
    enabled: bool,
    length: Cell<u64>,
    position: Cell<u64>,
    start_time: Cell<Option<Instant>>,
    message: RefCell<Option<String>>,
}

impl ExportProgress {
    /// Creates a new hidden progress bar. Pass `enabled = false` to make
    /// every subsequent method call a no-op.
    pub fn new(enabled: bool) -> Self {
        Self {
            enabled,
            length: Cell::new(0),
            position: Cell::new(0),
            start_time: Cell::new(None),
            message: RefCell::new(None),
        }
    }

    /// Starts the progress bar with the specified total length
    pub fn start(&self, length: i64) {
        let length = length.try_into().unwrap_or(0);
        self.length.set(length);
        self.position.set(0);
        self.start_time.set(Some(Instant::now()));
        self.emit_progress(
            "scanning",
            length,
            0,
            Some(format!("Found {length} messages")),
            None,
        );
        if !self.enabled {
            return;
        }
        self.draw();
    }

    /// Sets the progress bar to default style (clears any busy message)
    pub fn set_default_style(&self) {
        if !self.enabled {
            return;
        }
        *self.message.borrow_mut() = None;
        self.draw();
    }

    /// Sets the progress bar to busy style with a message
    pub fn set_busy_style(&self, message: String) {
        *self.message.borrow_mut() = Some(message.clone());
        self.emit_progress(
            "busy",
            self.position.get(),
            self.length.get(),
            Some(message),
            None,
        );
        if !self.enabled {
            return;
        }
        self.draw();
    }

    /// Sets the position of the progress bar
    pub fn set_position(&self, pos: u64) {
        self.position.set(pos);
        self.emit_progress("exporting", pos, self.length.get(), None, None);
        if !self.enabled {
            return;
        }
        self.draw();
    }

    /// Finishes the progress bar
    pub fn finish(&self) {
        let length = self.length.get();
        self.position.set(length);
        self.emit_progress("complete", length, length, None, None);
        if !self.enabled {
            return;
        }
        self.draw();
        eprintln!();
    }

    /// Print a line above the bar without clobbering it.
    ///
    /// Clears the bar's current line, writes `msg` followed by a newline,
    /// then redraws the bar one row below. When the bar is disabled, falls
    /// back to plain `eprintln!` so headless / log-file output is unchanged.
    pub fn println(&self, msg: impl Display) {
        if !self.enabled {
            eprintln!("{msg}");
            return;
        }
        {
            let mut stderr = io::stderr().lock();
            // \x1b[K erases from cursor to end of line, clearing the bar
            let _ = writeln!(stderr, "\r\x1b[K{msg}");
            let _ = stderr.flush();
        }
        self.draw();
    }

    /// Render the progress bar to stderr
    fn draw(&self) {
        let elapsed = self
            .start_time
            .get()
            .map(|t| t.elapsed())
            .unwrap_or_default();
        let elapsed_secs = elapsed.as_secs();

        let length = self.length.get();
        let position = self.position.get();

        // Build the bar: [##########>         ]
        let fraction = if length > 0 {
            position as f64 / length as f64
        } else {
            0.0
        };
        let filled = (fraction * BAR_WIDTH as f64) as usize;
        let mut bar = String::with_capacity(BAR_WIDTH);
        for i in 0..BAR_WIDTH {
            if i < filled {
                bar.push(BAR_FILL);
            } else if i == filled && filled < BAR_WIDTH {
                bar.push(BAR_ARROW);
            } else {
                bar.push(BAR_EMPTY);
            }
        }

        let pos_str = format_with_commas(position);
        let len_str = format_with_commas(length);

        // Rate/ETA or busy message
        let message = self.message.borrow();
        let rate_eta = if let Some(ref msg) = *message {
            format!("(ETA: N/A) {msg}")
        } else {
            let elapsed_f64 = elapsed.as_secs_f64();
            let rate = if elapsed_f64 > 0.0 {
                position as f64 / elapsed_f64
            } else {
                0.0
            };
            let eta = if rate > 0.0 {
                let remaining = length.saturating_sub(position) as f64 / rate;
                format!("{remaining:.0}s")
            } else {
                "N/A".to_string()
            };
            format!("({}/s, ETA: {eta})", format_human_rate(rate))
        };

        let line =
            format!("\r  [{elapsed_secs}s] [\x1b[36m{bar}\x1b[0m] {pos_str}/{len_str} {rate_eta}");

        let mut stderr = io::stderr().lock();
        // \x1b[K erases from cursor to end of line, clearing any leftover characters
        let _ = write!(stderr, "{line}\x1b[K");
        let _ = stderr.flush();
    }

    fn emit_progress(
        &self,
        phase: &str,
        current: u64,
        total: u64,
        message: Option<String>,
        current_file: Option<String>,
    ) {
        let percentage = match phase {
            "scanning" => 0.0,
            "exporting" => {
                if total > 0 {
                    (current as f32 / total as f32) * 100.0
                } else {
                    0.0
                }
            }
            "complete" => 100.0,
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
            let mut stdout = io::stdout().lock();
            let _ = writeln!(stdout, "PROGRESS_JSON: {json}");
            let _ = stdout.flush();
        }
    }
}

impl Default for ExportProgress {
    fn default() -> Self {
        Self::new(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_with_commas() {
        assert_eq!(format_with_commas(0), "0");
        assert_eq!(format_with_commas(999), "999");
        assert_eq!(format_with_commas(1_000), "1,000");
        assert_eq!(format_with_commas(1_000_000), "1,000,000");
        assert_eq!(format_with_commas(234_399), "234,399");
    }

    #[test]
    fn test_format_human_rate() {
        assert_eq!(format_human_rate(500.0), "500.0");
        assert_eq!(format_human_rate(1_500.0), "1.5k");
        assert_eq!(format_human_rate(89_209.7), "89.2k");
        assert_eq!(format_human_rate(1_500_000.0), "1.5M");
        assert_eq!(format_human_rate(2_500_000_000.0), "2.5B");
        assert_eq!(format_human_rate(1_200_000_000_000.0), "1.2T");
    }
}
