# `SEGMENT_CREATE_CONFLICT`

> Salesforce refused the create because a segment with this name already exists (HTTP 409). The plugin does not switch to an update; inspect the target, then preview again.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Segment                                                                    |
| **Commands** | `sf data360 deploy`                                                        |
| **Outcome**  | `failed` — mutation `rejected`: Salesforce refused the create, nothing was written |

## What it means

The preview found no segment with this name, so the deploy sent one create request. Salesforce answered HTTP 409: a segment with this name exists, for example because it was created in the meantime.

## Why the plugin stops

A create that conflicts is never turned into an update, and it is not retried. Salesforce answered the request itself with a refusal, so this create wrote nothing; the segment that already exists is not touched.

## How to fix

1. Retrieve the segment with `sf data360 retrieve -m segment:<Name>` and compare it with your file.
2. Run `sf data360 deploy --source-dir <file> --preview`; with the segment now present the preview shows an update, no change or a block.
3. Deploy again with `--allow-processing` if the preview allows it.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: segment:Example_Segment; mutation: rejected.
SEGMENT_CREATE_CONFLICT: Salesforce API rejected the request (HTTP 409); no response payload is disclosed. Salesforce rejected the write and nothing was written for this item; correct the input before another attempt.
Hint: Salesforce refused the create because a segment with this name already exists (HTTP 409). The plugin does not switch to an update; inspect the target, then preview again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_CREATE_CONFLICT.md
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`SEGMENT_CREATE_UNCONFIRMED`](../segment/SEGMENT_CREATE_UNCONFIRMED.md) — The create result could not be confirmed for other reasons.
- [`REQUEST_FAILED`](../general/REQUEST_FAILED.md) — Salesforce refused a create or update for another reason.
- [`SEGMENT_TARGET_DRIFT`](../segment/SEGMENT_TARGET_DRIFT.md) — A change was detected before the write.
