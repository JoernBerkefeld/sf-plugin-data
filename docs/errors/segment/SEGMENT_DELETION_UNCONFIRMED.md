# `SEGMENT_DELETION_UNCONFIRMED`

> The segment delete was sent, but the plugin could not confirm that the segment is gone. Check the segment in the org before any further delete; nothing is retried.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Segment                                                              |
| **Commands** | `sf data360 delete`                                                  |
| **Outcome**  | `failed` — mutation `unknown`: the segment may or may not be deleted |

## What it means

The plugin sent one delete request. Afterwards it reads the segment until it is gone or shows a deleting or processing state. Instead, the delete request failed, a read failed, the segment read back differently, it showed an unknown status, or the reads ran out of budget.

## Why the plugin stops

A success answer alone does not prove that the segment is gone, and a failed answer does not prove that it still exists. The plugin does not repeat the delete.

## How to fix

1. Read the segment, for example with `sf data360 retrieve -m segment:<Name> --output-dir <scratch>`.
2. If it is gone, nothing more is needed; remove the local file yourself if you want.
3. If it still exists, check its status in the org, wait until it is `ACTIVE`, and run the delete again.

## Example output

```text
Delete: failed.
Failed: segment:Example_Segment; mutation: unknown.
SEGMENT_DELETION_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Segment deletion may have occurred; absence is unconfirmed. No replay, fallback or rollback was performed.
Hint: The segment delete was sent, but the plugin could not confirm that the segment is gone. Check the segment in the org before any further delete; nothing is retried.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DELETION_UNCONFIRMED.md
```

## Related codes

- [`SEGMENT_DELETE_ADMISSION_FAILED`](../segment/SEGMENT_DELETE_ADMISSION_FAILED.md) — The delete was stopped before it was sent.
