# `SEGMENT_PUBLISH_FAILED`

> Salesforce ran the publish and reports publishStatus FAILED. Check the segment and its source DMO in Data Cloud before publishing again; nothing was resent.

|              |                                                                  |
| ------------ | ---------------------------------------------------------------- |
| **Family**   | Segment                                                          |
| **Commands** | `sf data360 publish`                                             |
| **Outcome**  | `failed` — mutation `publish-failed`: the publish ran and failed |

## What it means

Salesforce accepted the publish, and the status reads afterwards showed `publishStatus` FAILED for this publish.

## Why the plugin stops

The plugin reports the result Salesforce gives. It never starts a second publish on its own.

## How to fix

1. Open the segment in Data Cloud and check why the publish failed (for example the SQL or the source DMO).
2. Fix the cause, deploy the segment if you changed its file, then run the publish again.

## Example output

```text
Publish: failed.
failed: Example_Segment; mutation: publish-failed.
publishStatus: FAILED after 840 s.
SEGMENT_PUBLISH_FAILED: Salesforce reports publishStatus FAILED for segment Example_Segment after 840 s. Check the segment in Data Cloud before publishing again.
Hint: Salesforce ran the publish and reports publishStatus FAILED. Check the segment and its source DMO in Data Cloud before publishing again; nothing was resent.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PUBLISH_FAILED.md
```

## Related codes

- [`SEGMENT_PUBLISH_STILL_PROCESSING`](../segment/SEGMENT_PUBLISH_STILL_PROCESSING.md) — The wait ended before a result.
