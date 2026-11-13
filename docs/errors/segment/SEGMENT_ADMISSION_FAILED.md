# `SEGMENT_ADMISSION_FAILED`

> The checks right before the segment write failed, so nothing was sent. Make sure the .segment.json file did not change during the run, check the org, and run the deploy again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Right before writing a segment, the deploy repeats its checks: it validates the file again, confirms the file bytes have not changed since the command started, previews the target again and reads the segment's DMO. One of these steps failed with an error that has no more specific code, for example a failed read or a file that changed on disk.

## Why the plugin stops

A segment write starts processing in Salesforce and is sent only once. The plugin sends it only when every fresh check passes.

## How to fix

1. Make sure nothing edits the `.segment.json` file while the command runs.
2. Read the message for a Salesforce API detail and fix that cause.
3. Run `sf data360 deploy --source-dir <file> --preview`, then the deploy again.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: segment:Example_Segment; mutation: not-attempted.
SEGMENT_ADMISSION_FAILED: Segment deployment was not attempted. Resolve input, scope, effects or target qualification.
Hint: The checks right before the segment write failed, so nothing was sent. Make sure the .segment.json file did not change during the run, check the org, and run the deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_ADMISSION_FAILED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`SEGMENT_TARGET_UNQUALIFIED`](../segment/SEGMENT_TARGET_UNQUALIFIED.md) — The fresh preview of the target did not allow the write.
- [`SEGMENT_DEPENDENCY_DRIFT`](../segment/SEGMENT_DEPENDENCY_DRIFT.md) — The DMO changed during the run.
