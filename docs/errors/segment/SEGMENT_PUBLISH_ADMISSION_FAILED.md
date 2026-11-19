# `SEGMENT_PUBLISH_ADMISSION_FAILED`

> The segment could not be read before the publish, or it does not exist in the org, so nothing was published. Deploy or check the segment, then rerun.

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Family**   | Segment                                                     |
| **Commands** | `sf data360 publish`                                        |
| **Outcome**  | `blocked` — mutation `not-attempted`: nothing was published |

## What it means

Before sending the publish, the plugin reads the segment by its name (unique in the org; a segment of another data space than the run's is `SEGMENT_DATASPACE_MISMATCH`). The read failed, answered 404 (the segment does not exist), or returned a different name or record ID.

## Why the plugin stops

The publish route needs the record ID of the segment, and the plugin only publishes a segment it has read itself. Without that read nothing is sent.

## How to fix

1. Check the segment name (case matters; `<prefix>_<Name>` in a non-default data space) and `--dataspace`.
2. If it does not exist yet, deploy it first: `sf data360 deploy -d data360/segments/<Name>.segment.json --allow-processing`.
3. Check the org login (`sf org display`) and the Salesforce API detail in the message, then rerun the publish.

## Example output

```text
Publish: blocked.
blocked: Example_Segment; mutation: not-attempted.
SEGMENT_PUBLISH_ADMISSION_FAILED: Segment Example_Segment does not exist in the org (HTTP 404 ITEM_NOT_FOUND). Deploy it first with sf data360 deploy. Nothing was published.
Hint: The segment could not be read before the publish, or it does not exist in the org, so nothing was published. Deploy or check the segment, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PUBLISH_ADMISSION_FAILED.md
```

## Related codes

- [`SEGMENT_PUBLISH_DEFINITION_MISMATCH`](../segment/SEGMENT_PUBLISH_DEFINITION_MISMATCH.md) — The org holds another definition than the file.
