# `SEGMENT_MEMBERS_READ_FAILED`

> Salesforce answered a member read with an error, or the detail query did not finish, so no file was written. Read the API detail in the message, fix the cause and rerun.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Family**   | Segment                                              |
| **Commands** | `sf data360 segment members export`                  |
| **Outcome**  | `failed` — no file was left; the org was not changed |

## What it means

Salesforce answered a read of the export with an error the plugin does not retry: for example HTTP 400 for parameters it refuses (`--filters`, `--order-by`, `--fields` or an offset it does not accept), 403, or 5xx after the retries. With `--include-details` it also covers a detail query that Salesforce reports as failed or that did not finish within ten minutes.

## Why the plugin stops

Reads are retried after network errors, HTTP 429 and 503 (three attempts). Any other error ends the export, because the rows read so far would be incomplete. The plugin sends the query parameters as given; Salesforce decides whether they are valid.

## How to fix

1. Read the HTTP status and the Salesforce API detail in the message.
2. Fix the parameter it names, or wait and rerun after a rate limit or outage.
3. Rerun the export.

## Example output

```text
Segment members export: failed.
SEGMENT_MEMBERS_READ_FAILED: Salesforce API rejected the request (HTTP 400); no response payload is disclosed. No output file was left. Nothing in the org changed.
Hint: Salesforce answered a member read with an error, or the detail query did not finish, so no file was written. Read the API detail in the message, fix the cause and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_MEMBERS_READ_FAILED.md
```

## Related codes

- [`SEGMENT_MEMBERS_UNEXPECTED_RESPONSE`](../segment/SEGMENT_MEMBERS_UNEXPECTED_RESPONSE.md) — Salesforce answered, but in an unexpected shape.
- [`SEGMENT_MEMBERS_NOT_FOUND`](../segment/SEGMENT_MEMBERS_NOT_FOUND.md) — the segment does not exist.
