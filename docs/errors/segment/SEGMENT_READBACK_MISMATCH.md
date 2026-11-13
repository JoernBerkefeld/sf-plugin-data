# `SEGMENT_READBACK_MISMATCH`

> After the write, the segment read back differently from the file, or other settings or its DMO changed. Inspect the segment in the org before any further deploy.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Segment                                                                    |
| **Commands** | `sf data360 deploy`                                                        |
| **Outcome**  | `failed` — mutation `unknown`: the change may or may not have been applied |

## What it means

After the create or update, the plugin reads the segment and its DMO again. The read showed a definition different from the file, a change to settings that should have stayed the same, or a DMO that no longer matches the one checked before the write.

## Why the plugin stops

The write was sent, but its result is not what was asked for. The plugin does not retry and does not roll back, because either could make things worse.

## How to fix

1. Retrieve the segment with `sf data360 retrieve -m segment:<Name> --output-dir <scratch>` and compare it with your file.
2. Check whether someone else changed the segment or its DMO at the same time.
3. Decide whether to deploy again, after a preview.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: segment:Example_Segment; mutation: unknown.
SEGMENT_READBACK_MISMATCH: Segment mutation may have occurred. Inspect the exact target; no retry or rollback was performed.
Hint: After the write, the segment read back differently from the file, or other settings or its DMO changed. Inspect the segment in the org before any further deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_READBACK_MISMATCH.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`SEGMENT_SETTLEMENT_UNQUALIFIED`](../segment/SEGMENT_SETTLEMENT_UNQUALIFIED.md) — The status after the write was unexpected.
- [`SEGMENT_UPDATE_UNCONFIRMED`](../segment/SEGMENT_UPDATE_UNCONFIRMED.md) — The result could not be read at all.
