# Attachment Table Structure

| cid | name                           | type    | notnull | dflt_value | pk |
|:----|:-------------------------------|:--------|:--------|:-----------|:---|
| 0   | ROWID                          | INTEGER | 0       |            | 1  |
| 1   | guid                           | TEXT    | 1       |            | 0  |
| 2   | created_date                   | INTEGER | 0       | 0          | 0  |
| 3   | start_date                     | INTEGER | 0       | 0          | 0  |
| 4   | filename                       | TEXT    | 0       |            | 0  |
| 5   | uti                            | TEXT    | 0       |            | 0  |
| 6   | mime_type                      | TEXT    | 0       |            | 0  |
| 7   | transfer_state                 | INTEGER | 0       | 0          | 0  |
| 8   | is_outgoing                    | INTEGER | 0       | 0          | 0  |
| 9   | user_info                      | BLOB    | 0       |            | 0  |
| 10  | transfer_name                  | TEXT    | 0       |            | 0  |
| 11  | total_bytes                    | INTEGER | 0       | 0          | 0  |
| 12  | is_sticker                     | INTEGER | 0       | 0          | 0  |
| 13  | sticker_user_info              | BLOB    | 0       |            | 0  |
| 14  | attribution_info               | BLOB    | 0       |            | 0  |
| 15  | hide_attachment                | INTEGER | 0       | 0          | 0  |
| 16  | ck_sync_state                  | INTEGER | 0       | 0          | 0  |
| 17  | ck_server_change_token_blob    | BLOB    | 0       |            | 0  |
| 18  | ck_record_id                   | TEXT    | 0       |            | 0  |
| 19  | original_guid                  | TEXT    | 1       |            | 0  |
| 20  | is_commsafety_sensitive        | INTEGER | 0       | 0          | 0  |
| 21  | emoji_image_content_identifier | TEXT    | 0       | NULL       | 0  |
| 22  | emoji_image_short_description  | TEXT    | 0       | NULL       | 0  |
| 23  | preview_generation_state       | INTEGER | 0       | 0          | 0  |
