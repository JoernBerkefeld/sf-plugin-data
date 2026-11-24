# `SEGMENT_PUBLISH_DEFINITION_MISMATCH`

> The segment in the org does not hold the definition of the selected file, so it was not published. Deploy the file first, or publish the org segment with -m segment:Name.

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Family**   | Segment                                                     |
| **Commands** | `sf data360 publish`                                        |
| **Outcome**  | `blocked` — mutation `not-attempted`: nothing was published |

## What it means

With `--source-dir data360/segments/<Name>.segment.json` the plugin publishes the segment only when the org holds exactly the definition of that file (label, description, source DMO, SQL models or criteria). The segment read from the org differs, or has a shape the file cannot hold.

## Why the plugin stops

A publish sends no definition: Salesforce publishes what the org holds. Publishing from a file that differs would publish something other than the file shows.

## How to fix

1. Deploy the file first: `sf data360 deploy --source-dir data360/segments/<Name>.segment.json --allow-processing`, then publish again.
2. Or publish the segment as the org holds it: `sf data360 publish -m segment:<Name>`.

## Example output

```text
Publish: blocked.
blocked: Example_Segment; mutation: not-attempted.
SEGMENT_PUBLISH_DEFINITION_MISMATCH: Segment Example_Segment in the org does not hold the definition of the file. Deploy the file first, or publish what the org holds with -m segment:Example_Segment. Nothing was published.
Hint: The segment in the org does not hold the definition of the selected file, so it was not published. Deploy the file first, or publish the org segment with -m segment:Name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PUBLISH_DEFINITION_MISMATCH.md
```

## Related codes

- [`SEGMENT_PUBLISH_ADMISSION_FAILED`](../segment/SEGMENT_PUBLISH_ADMISSION_FAILED.md) — The segment could not be read.
