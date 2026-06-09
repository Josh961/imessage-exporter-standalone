# Messages Table Structure

| cid | name                              | type    | notnull | dflt_value | pk |
|:----|:----------------------------------|:--------|:--------|:-----------|:---|
| 0   | ROWID                             | INTEGER | 0       |            | 1  |
| 1   | guid                              | TEXT    | 1       |            | 0  |
| 2   | text                              | TEXT    | 0       |            | 0  |
| 3   | replace                           | INTEGER | 0       | 0          | 0  |
| 4   | service_center                    | TEXT    | 0       |            | 0  |
| 5   | handle_id                         | INTEGER | 0       | 0          | 0  |
| 6   | subject                           | TEXT    | 0       |            | 0  |
| 7   | country                           | TEXT    | 0       |            | 0  |
| 8   | attributedBody                    | BLOB    | 0       |            | 0  |
| 9   | version                           | INTEGER | 0       | 0          | 0  |
| 10  | type                              | INTEGER | 0       | 0          | 0  |
| 11  | service                           | TEXT    | 0       |            | 0  |
| 12  | account                           | TEXT    | 0       |            | 0  |
| 13  | account_guid                      | TEXT    | 0       |            | 0  |
| 14  | error                             | INTEGER | 0       | 0          | 0  |
| 15  | date                              | INTEGER | 0       |            | 0  |
| 16  | date_read                         | INTEGER | 0       |            | 0  |
| 17  | date_delivered                    | INTEGER | 0       |            | 0  |
| 18  | is_delivered                      | INTEGER | 0       | 0          | 0  |
| 19  | is_finished                       | INTEGER | 0       | 0          | 0  |
| 20  | is_emote                          | INTEGER | 0       | 0          | 0  |
| 21  | is_from_me                        | INTEGER | 0       | 0          | 0  |
| 22  | is_empty                          | INTEGER | 0       | 0          | 0  |
| 23  | is_delayed                        | INTEGER | 0       | 0          | 0  |
| 24  | is_auto_reply                     | INTEGER | 0       | 0          | 0  |
| 25  | is_prepared                       | INTEGER | 0       | 0          | 0  |
| 26  | is_read                           | INTEGER | 0       | 0          | 0  |
| 27  | is_system_message                 | INTEGER | 0       | 0          | 0  |
| 28  | is_sent                           | INTEGER | 0       | 0          | 0  |
| 29  | has_dd_results                    | INTEGER | 0       | 0          | 0  |
| 30  | is_service_message                | INTEGER | 0       | 0          | 0  |
| 31  | is_forward                        | INTEGER | 0       | 0          | 0  |
| 32  | was_downgraded                    | INTEGER | 0       | 0          | 0  |
| 33  | is_archive                        | INTEGER | 0       | 0          | 0  |
| 34  | cache_has_attachments             | INTEGER | 0       | 0          | 0  |
| 35  | cache_roomnames                   | TEXT    | 0       |            | 0  |
| 36  | was_data_detected                 | INTEGER | 0       | 0          | 0  |
| 37  | was_deduplicated                  | INTEGER | 0       | 0          | 0  |
| 38  | is_audio_message                  | INTEGER | 0       | 0          | 0  |
| 39  | is_played                         | INTEGER | 0       | 0          | 0  |
| 40  | date_played                       | INTEGER | 0       |            | 0  |
| 41  | item_type                         | INTEGER | 0       | 0          | 0  |
| 42  | other_handle                      | INTEGER | 0       | 0          | 0  |
| 43  | group_title                       | TEXT    | 0       |            | 0  |
| 44  | group_action_type                 | INTEGER | 0       | 0          | 0  |
| 45  | share_status                      | INTEGER | 0       | 0          | 0  |
| 46  | share_direction                   | INTEGER | 0       | 0          | 0  |
| 47  | is_expirable                      | INTEGER | 0       | 0          | 0  |
| 48  | expire_state                      | INTEGER | 0       | 0          | 0  |
| 49  | message_action_type               | INTEGER | 0       | 0          | 0  |
| 50  | message_source                    | INTEGER | 0       | 0          | 0  |
| 51  | associated_message_guid           | TEXT    | 0       |            | 0  |
| 52  | associated_message_type           | INTEGER | 0       | 0          | 0  |
| 53  | balloon_bundle_id                 | TEXT    | 0       |            | 0  |
| 54  | payload_data                      | BLOB    | 0       |            | 0  |
| 55  | expressive_send_style_id          | TEXT    | 0       |            | 0  |
| 56  | associated_message_range_location | INTEGER | 0       | 0          | 0  |
| 57  | associated_message_range_length   | INTEGER | 0       | 0          | 0  |
| 58  | time_expressive_send_played       | INTEGER | 0       |            | 0  |
| 59  | message_summary_info              | BLOB    | 0       |            | 0  |
| 60  | ck_sync_state                     | INTEGER | 0       | 0          | 0  |
| 61  | ck_record_id                      | TEXT    | 0       |            | 0  |
| 62  | ck_record_change_tag              | TEXT    | 0       |            | 0  |
| 63  | destination_caller_id             | TEXT    | 0       |            | 0  |
| 64  | is_corrupt                        | INTEGER | 0       | 0          | 0  |
| 65  | reply_to_guid                     | TEXT    | 0       |            | 0  |
| 66  | sort_id                           | INTEGER | 0       |            | 0  |
| 67  | is_spam                           | INTEGER | 0       | 0          | 0  |
| 68  | has_unseen_mention                | INTEGER | 0       | 0          | 0  |
| 69  | thread_originator_guid            | TEXT    | 0       |            | 0  |
| 70  | thread_originator_part            | TEXT    | 0       |            | 0  |
| 71  | syndication_ranges                | TEXT    | 0       |            | 0  |
| 72  | synced_syndication_ranges         | TEXT    | 0       |            | 0  |
| 73  | was_delivered_quietly             | INTEGER | 0       | 0          | 0  |
| 74  | did_notify_recipient              | INTEGER | 0       | 0          | 0  |
| 75  | date_retracted                    | INTEGER | 0       | 0          | 0  |
| 76  | date_edited                       | INTEGER | 0       | 0          | 0  |
| 77  | was_detonated                     | INTEGER | 0       | 0          | 0  |
| 78  | part_count                        | INTEGER | 0       |            | 0  |
| 79  | is_stewie                         | INTEGER | 0       | 0          | 0  |
| 80  | is_kt_verified                    | INTEGER | 0       | 0          | 0  |
| 81  | is_sos                            | INTEGER | 0       | 0          | 0  |
| 82  | is_critical                       | INTEGER | 0       | 0          | 0  |
| 83  | bia_reference_id                  | TEXT    | 0       | NULL       | 0  |
| 84  | fallback_hash                     | TEXT    | 0       | NULL       | 0  |
| 85  | associated_message_emoji          | TEXT    | 0       | NULL       | 0  |
| 86  | is_pending_satellite_send         | INTEGER | 0       | 0          | 0  |
| 87  | needs_relay                       | INTEGER | 0       | 0          | 0  |
| 88  | schedule_type                     | INTEGER | 0       | 0          | 0  |
| 89  | schedule_state                    | INTEGER | 0       | 0          | 0  |
| 90  | sent_or_received_off_grid         | INTEGER | 0       | 0          | 0  |
| 91  | date_recovered                    | INTEGER | 0       | 0          | 0  |
| 92  | is_time_sensitive                 | INTEGER | 0       | 0          | 0  |
| 93  | ck_chat_id                        | TEXT    | 0       |            | 0  |
