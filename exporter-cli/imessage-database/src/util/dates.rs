/*!
 Contains date parsing functions for iMessage dates.

 Most dates are stored as nanosecond-precision unix timestamps with an epoch of `1/1/2001 00:00:00` in UTC.
*/
use std::fmt::Write;

use chrono::{DateTime, Datelike, Local, Months, TimeZone, Utc};

use crate::error::message::MessageError;

const SEPARATOR: &str = ", ";
const SECONDS_PER_MINUTE: i64 = 60;
const SECONDS_PER_HOUR: i64 = 60 * SECONDS_PER_MINUTE;
const SECONDS_PER_DAY: i64 = 24 * SECONDS_PER_HOUR;
const SECONDS_PER_YEAR: i64 = 365 * SECONDS_PER_DAY;

/// Factor used to convert between nanosecond-precision timestamps and seconds
///
/// The iMessage database stores timestamps as nanoseconds, so this factor is used
/// to convert between the database format and standard Unix timestamps.
pub const TIMESTAMP_FACTOR: i64 = 1_000_000_000;

/// Get the date offset for the iMessage Database
///
/// This offset is used to adjust the unix timestamps stored in the iMessage database
/// with a non-standard epoch of `2001-01-01 00:00:00` in UTC.
///
/// # Example
///
/// ```
/// use imessage_database::util::dates::get_offset;
///
/// let current_epoch = get_offset();
/// ```
#[must_use]
pub fn get_offset() -> i64 {
    Utc.with_ymd_and_hms(2001, 1, 1, 0, 0, 0)
        .unwrap()
        .timestamp()
}

/// Create a `DateTime<Local>` from an arbitrary date and offset
///
/// This is used to create date data for anywhere dates are stored in the table, including
/// `PLIST` payloads or [`typedstream`](crate::util::typedstream) data.
///
/// # Example
///
/// ```
/// use imessage_database::util::dates::{get_local_time, get_offset};
///
/// let current_offset = get_offset();
/// let local = get_local_time(674526582885055488, current_offset).unwrap();
/// ```
pub fn get_local_time(date_stamp: i64, offset: i64) -> Result<DateTime<Local>, MessageError> {
    // Newer databases store timestamps as nanoseconds since 2001-01-01,
    // while older ones store plain seconds since 2001-01-01.
    let seconds_since_2001 = if date_stamp >= 1_000_000_000_000 {
        date_stamp / TIMESTAMP_FACTOR
    } else {
        date_stamp
    };

    let utc_stamp = DateTime::from_timestamp(seconds_since_2001 + offset, 0)
        .ok_or(MessageError::InvalidTimestamp(date_stamp))?
        .naive_utc();
    Ok(Local.from_utc_datetime(&utc_stamp))
}

/// Format a date from the iMessage table for reading
///
/// # Example:
///
/// ```
/// use chrono::offset::Local;
/// use imessage_database::util::dates::format;
///
/// let date = format(&Local::now());
/// println!("{date}");
/// ```
#[must_use]
pub fn format(date: &DateTime<Local>) -> String {
    DateTime::format(date, "%b %d, %Y %l:%M:%S %p").to_string()
}

/// Generate a readable diff from two local timestamps.
///
/// # Example:
///
/// ```
/// use chrono::prelude::*;
/// use imessage_database::util::dates::readable_diff;
///
/// let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
/// let end = Local.with_ymd_and_hms(2020, 5, 20, 9, 15, 13).unwrap();
/// println!("{}", readable_diff(&start, &end).unwrap()) // "5 minutes, 2 seconds"
/// ```
#[must_use]
pub fn readable_diff(start: &DateTime<Local>, end: &DateTime<Local>) -> Option<String> {
    // Calculate diff
    let seconds = end.timestamp() - start.timestamp();

    // Early escape for invalid date diff
    if seconds < 0 {
        return None;
    }

    let (years, remaining_seconds) = years_and_remainder(start, end)
        .unwrap_or((seconds / SECONDS_PER_YEAR, seconds % SECONDS_PER_YEAR));

    // 51 is the length of a diff string that has all components with 2 digits each.
    // This represented a performance increase of ~20% over a string that starts empty and grows with each component.
    let mut out_s = String::with_capacity(51);

    let days = remaining_seconds / SECONDS_PER_DAY;
    let hours = (remaining_seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR;
    let minutes = (remaining_seconds % SECONDS_PER_DAY % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE;
    let secs = remaining_seconds % SECONDS_PER_DAY % SECONDS_PER_HOUR % SECONDS_PER_MINUTE;

    append_component(&mut out_s, years, "year", "years");
    append_component(&mut out_s, days, "day", "days");
    append_component(&mut out_s, hours, "hour", "hours");
    append_component(&mut out_s, minutes, "minute", "minutes");
    append_component(&mut out_s, secs, "second", "seconds");

    Some(out_s)
}

/// Calculate the number of whole years between two dates, and the remaining seconds after accounting for those years.
fn years_and_remainder(start: &DateTime<Local>, end: &DateTime<Local>) -> Option<(i64, i64)> {
    let mut years = end.year() - start.year();

    if years <= 0 {
        return Some((0, end.timestamp() - start.timestamp()));
    }

    let mut remainder_start =
        start.checked_add_months(Months::new(u32::try_from(years).ok()?.checked_mul(12)?))?;

    if remainder_start > *end {
        years -= 1;
        remainder_start =
            start.checked_add_months(Months::new(u32::try_from(years).ok()?.checked_mul(12)?))?;
    }

    Some((
        i64::from(years),
        end.timestamp() - remainder_start.timestamp(),
    ))
}

/// Append a time component to the output string if the value is greater than 0, with correct singular/plural formatting.
fn append_component(out_s: &mut String, value: i64, singular: &str, plural: &str) {
    if value == 0 {
        return;
    }

    if !out_s.is_empty() {
        out_s.push_str(SEPARATOR);
    }

    let metric = if value == 1 { singular } else { plural };
    let _ = write!(out_s, "{value} {metric}");
}

#[cfg(test)]
mod tests {
    use crate::util::dates::{TIMESTAMP_FACTOR, format, get_local_time, get_offset, readable_diff};
    use chrono::prelude::*;

    #[test]
    fn can_format_date_single_digit() {
        let date = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        assert_eq!(format(&date), "May 20, 2020  9:10:11 AM");
    }

    #[test]
    fn can_format_date_double_digit() {
        let date = Local.with_ymd_and_hms(2020, 5, 20, 10, 10, 11).unwrap();
        assert_eq!(format(&date), "May 20, 2020 10:10:11 AM");
    }

    #[test]
    fn cant_format_diff_backwards() {
        let end = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 30).unwrap();
        assert_eq!(readable_diff(&start, &end), None);
    }

    #[test]
    fn can_format_diff_all_singular() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 21, 10, 11, 12).unwrap();
        assert_eq!(
            readable_diff(&start, &end),
            Some("1 day, 1 hour, 1 minute, 1 second".to_owned())
        );
    }

    #[test]
    fn can_format_diff_mixed_singular() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 22, 10, 20, 12).unwrap();
        assert_eq!(
            readable_diff(&start, &end),
            Some("2 days, 1 hour, 10 minutes, 1 second".to_owned())
        );
    }

    #[test]
    fn can_format_diff_seconds() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 30).unwrap();
        assert_eq!(readable_diff(&start, &end), Some("19 seconds".to_owned()));
    }

    #[test]
    fn can_format_diff_minutes() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 20, 9, 15, 11).unwrap();
        assert_eq!(readable_diff(&start, &end), Some("5 minutes".to_owned()));
    }

    #[test]
    fn can_format_diff_hours() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 20, 12, 10, 11).unwrap();
        assert_eq!(readable_diff(&start, &end), Some("3 hours".to_owned()));
    }

    #[test]
    fn can_format_diff_days() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 30, 9, 10, 11).unwrap();
        assert_eq!(readable_diff(&start, &end), Some("10 days".to_owned()));
    }

    #[test]
    fn can_format_diff_minutes_seconds() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 20, 9, 15, 30).unwrap();
        assert_eq!(
            readable_diff(&start, &end),
            Some("5 minutes, 19 seconds".to_owned())
        );
    }

    #[test]
    fn can_format_diff_days_minutes() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 22, 9, 30, 11).unwrap();
        assert_eq!(
            readable_diff(&start, &end),
            Some("2 days, 20 minutes".to_owned())
        );
    }

    #[test]
    fn can_format_diff_month() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 7, 20, 9, 10, 11).unwrap();
        assert_eq!(readable_diff(&start, &end), Some("61 days".to_owned()));
    }

    #[test]
    fn can_format_diff_single_year() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2021, 5, 20, 9, 10, 11).unwrap();
        assert_eq!(readable_diff(&start, &end), Some("1 year".to_owned()));
    }

    #[test]
    fn can_format_diff_years_days() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2022, 7, 20, 9, 10, 11).unwrap();
        assert_eq!(
            readable_diff(&start, &end),
            Some("2 years, 61 days".to_owned())
        );
    }

    #[test]
    fn can_format_diff_leap_day_anniversary_as_year() {
        let start = Local.with_ymd_and_hms(2020, 2, 29, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2021, 2, 28, 9, 10, 11).unwrap();
        assert_eq!(readable_diff(&start, &end), Some("1 year".to_owned()));
    }

    #[test]
    fn can_format_diff_all() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 22, 14, 32, 45).unwrap();
        assert_eq!(
            readable_diff(&start, &end),
            Some("2 days, 5 hours, 22 minutes, 34 seconds".to_owned())
        );
    }

    #[test]
    fn can_format_no_diff() {
        let start = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        let end = Local.with_ymd_and_hms(2020, 5, 20, 9, 10, 11).unwrap();
        assert_eq!(readable_diff(&start, &end), Some(String::new()));
    }

    #[test]
    fn can_get_local_time_from_seconds_timestamp() {
        let offset = get_offset();
        let expected_utc = Utc
            .with_ymd_and_hms(2020, 5, 20, 9, 10, 11)
            .single()
            .unwrap();

        // Older databases store seconds since 2001-01-01 00:00:00
        let stamp_secs = expected_utc.timestamp() - offset;

        let local = get_local_time(stamp_secs, offset).unwrap();
        let expected_local = expected_utc.with_timezone(&Local);

        assert_eq!(local, expected_local);
    }

    #[test]
    fn can_get_local_time_from_nanoseconds_timestamp() {
        let offset = get_offset();
        let expected_utc = Utc
            .with_ymd_and_hms(2020, 5, 20, 9, 10, 11)
            .single()
            .unwrap();

        // Newer databases store nanoseconds since 2001-01-01 00:00:00
        let stamp_ns = (expected_utc.timestamp() - offset) * TIMESTAMP_FACTOR;

        let local = get_local_time(stamp_ns, offset).unwrap();
        let expected_local = expected_utc.with_timezone(&Local);

        assert_eq!(local, expected_local);
    }

    #[test]
    fn can_get_local_time_from_hardcoded_seconds_timestamp() {
        let offset = get_offset();

        // Legacy-style seconds timestamp
        let stamp_secs: i64 = 347_670_404;

        let expected_utc = Utc.timestamp_opt(stamp_secs + offset, 0).single().unwrap();

        let local = get_local_time(stamp_secs, offset).unwrap();
        let expected_local = expected_utc.with_timezone(&Local);

        assert_eq!(local, expected_local);
    }

    #[test]
    fn can_get_local_time_from_hardcoded_nanoseconds_timestamp() {
        let offset = get_offset();

        // Nanosecond-style timestamp
        let stamp_ns: i64 = 549_948_395_013_559_360;

        let seconds_since_2001 = stamp_ns / TIMESTAMP_FACTOR;

        let expected_utc = Utc
            .timestamp_opt(seconds_since_2001 + offset, 0)
            .single()
            .unwrap();

        let local = get_local_time(stamp_ns, offset).unwrap();
        let expected_local = expected_utc.with_timezone(&Local);

        assert_eq!(local, expected_local);
    }
}
