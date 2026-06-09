# Chat Table Structure

| cid | name                          | type    | notnull | dflt_value | pk |
|:----|:------------------------------|:--------|:--------|:-----------|:---|
| 0   | ROWID                         | INTEGER | 0       |            | 1  |
| 1   | guid                          | TEXT    | 1       |            | 0  |
| 2   | style                         | INTEGER | 0       |            | 0  |
| 3   | state                         | INTEGER | 0       |            | 0  |
| 4   | account_id                    | TEXT    | 0       |            | 0  |
| 5   | properties                    | BLOB    | 0       |            | 0  |
| 6   | chat_identifier               | TEXT    | 0       |            | 0  |
| 7   | service_name                  | TEXT    | 0       |            | 0  |
| 8   | room_name                     | TEXT    | 0       |            | 0  |
| 9   | account_login                 | TEXT    | 0       |            | 0  |
| 10  | is_archived                   | INTEGER | 0       | 0          | 0  |
| 11  | last_addressed_handle         | TEXT    | 0       |            | 0  |
| 12  | display_name                  | TEXT    | 0       |            | 0  |
| 13  | group_id                      | TEXT    | 0       |            | 0  |
| 14  | is_filtered                   | INTEGER | 0       | 0          | 0  |
| 15  | successful_query              | INTEGER | 0       |            | 0  |
| 16  | engram_id                     | TEXT    | 0       |            | 0  |
| 17  | server_change_token           | TEXT    | 0       |            | 0  |
| 18  | ck_sync_state                 | INTEGER | 0       | 0          | 0  |
| 19  | original_group_id             | TEXT    | 0       |            | 0  |
| 20  | last_read_message_timestamp   | INTEGER | 0       | 0          | 0  |
| 21  | cloudkit_record_id            | TEXT    | 0       |            | 0  |
| 22  | last_addressed_sim_id         | TEXT    | 0       |            | 0  |
| 23  | is_blackholed                 | INTEGER | 0       | 0          | 0  |
| 24  | syndication_date              | INTEGER | 0       | 0          | 0  |
| 25  | syndication_type              | INTEGER | 0       | 0          | 0  |
| 26  | is_recovered                  | INTEGER | 0       | 0          | 0  |
| 27  | is_deleting_incoming_messages | INTEGER | 0       | 0          | 0  |
| 28  | is_pending_review             | INTEGER | 0       | 0          | 0  |
