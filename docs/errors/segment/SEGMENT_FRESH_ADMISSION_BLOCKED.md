# `SEGMENT_FRESH_ADMISSION_BLOCKED`

> Right before writing this segment in a batch, a fresh check no longer allowed a create, update or no change, or --allow-processing was missing. Preview the batch again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

When a deploy holds several components, it previews all of them first and then writes them one by one. Before writing a segment, it previews that segment again. The fresh preview was blocked, or it planned a create or update while `--allow-processing` was not set.

The item is reported with the code `DEPLOY_FRESH_ADMISSION_BLOCKED`; this code is the segment-specific reason behind it.

## Why the plugin stops

Earlier items of the batch may have changed the org. The plugin writes the segment only if it is still allowed after those changes.

## How to fix

1. Run the same deploy with `--preview` and read the segment's code.
2. Fix that cause; add `--allow-processing` if the segment is created or updated.
3. Run the deploy again.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: segment:Example_Segment; mutation: not-attempted.
DEPLOY_FRESH_ADMISSION_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Fresh input or dependency admission failed before this item. No further writes were attempted.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_FRESH_ADMISSION_BLOCKED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`DEPLOY_FRESH_ADMISSION_BLOCKED`](../general/DEPLOY_FRESH_ADMISSION_BLOCKED.md) — The code the item is reported with.
- [`PROCESSING_ACKNOWLEDGEMENT_REQUIRED`](../general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md) — A create or update needs --allow-processing.
