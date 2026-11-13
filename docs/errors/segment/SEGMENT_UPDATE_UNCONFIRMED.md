# `SEGMENT_UPDATE_UNCONFIRMED`

> The segment update was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Segment                                                                    |
| **Commands** | `sf data360 deploy`                                                        |
| **Outcome**  | `failed` — mutation `unknown`: the change may or may not have been applied |

## What it means

The deploy sent one update for the existing segment. Afterwards it could not confirm the result: the request failed or its answer did not acknowledge the change, a follow-up read failed, or the reads did not settle within the read budget (12 reads, at most 2 minutes).

## Why the plugin stops

An update may have taken effect even when its answer was lost. The plugin reports the outcome as unknown and does not send it again.

## How to fix

1. Retrieve the segment with `sf data360 retrieve -m segment:<Name> --output-dir <scratch>` and compare it with your file.
2. If it already matches, nothing more is needed; otherwise preview the deploy again.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: segment:Example_Segment; mutation: unknown.
SEGMENT_UPDATE_UNCONFIRMED: Segment mutation may have occurred. Inspect the exact target; no retry or rollback was performed.
Hint: The segment update was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_UPDATE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`SEGMENT_CREATE_UNCONFIRMED`](../segment/SEGMENT_CREATE_UNCONFIRMED.md) — The same situation for a create.
- [`SEGMENT_READBACK_MISMATCH`](../segment/SEGMENT_READBACK_MISMATCH.md) — The segment was read back but differs.
