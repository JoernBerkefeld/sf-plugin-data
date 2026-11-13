# `SEGMENT_CREATE_UNCONFIRMED`

> The segment create was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Segment                                                                    |
| **Commands** | `sf data360 deploy`                                                        |
| **Outcome**  | `failed` — mutation `unknown`: the change may or may not have been applied |

## What it means

The deploy sent one create request for the segment. Afterwards it could not confirm the result: the request failed or timed out, the answer did not match the file, or the follow-up reads did not show the expected segment within the read budget (12 reads, at most 2 minutes).

## Why the plugin stops

A create may have taken effect even when its answer was lost. Sending it again could fail or create side effects, so the plugin reports the outcome as unknown and stops.

## How to fix

1. Retrieve the segment with `sf data360 retrieve -m segment:<Name>`.
2. If it exists and matches your file, nothing more is needed. If it exists but differs, preview the deploy again. If it does not exist, deploy again.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: segment:Example_Segment; mutation: unknown.
SEGMENT_CREATE_UNCONFIRMED: Segment mutation may have occurred. Inspect the exact target; no retry or rollback was performed.
Hint: The segment create was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_CREATE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`SEGMENT_CREATE_CONFLICT`](../segment/SEGMENT_CREATE_CONFLICT.md) — The create was refused because the name exists.
- [`SEGMENT_UPDATE_UNCONFIRMED`](../segment/SEGMENT_UPDATE_UNCONFIRMED.md) — The same situation for an update.
- [`SEGMENT_READBACK_MISMATCH`](../segment/SEGMENT_READBACK_MISMATCH.md) — The segment was read back but differs.
