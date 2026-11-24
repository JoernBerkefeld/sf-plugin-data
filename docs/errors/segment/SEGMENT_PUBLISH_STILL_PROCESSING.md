# `SEGMENT_PUBLISH_STILL_PROCESSING`

> Salesforce accepted the publish and is still processing it when --wait ran out. It did not fail and was not resent; read the segment later for the result.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Segment                                                                               |
| **Commands** | `sf data360 publish`                                                                  |
| **Outcome**  | `processing` — outcome `publishing`, mutation `acknowledged-processing`; exit code 69 |

## What it means

Salesforce accepted the publish, and the segment was read every 30 seconds, but `publishStatus` was not SUCCESS or FAILED for this publish before `--wait` (default 30 minutes) ran out. A publish can take many minutes.

## Why the plugin reports it

Running out of wait time says nothing about the publish itself. Reporting it as failed would be wrong, and publishing again would start a second job. The status is `processing` and the exit code is 69, so a script can tell "not finished yet" apart from success (0) and failure (1).

## How to fix

1. Do not run the publish again just because of this message.
2. Read the segment later, for example `sf data360 retrieve -m segment:<Name> --output-dir <scratch>` or in Data Cloud, until its publish status is SUCCESS or FAILED.
3. For a longer wait next time, pass a larger `--wait` in minutes.

## Example output

```text
Publish: processing.
publishing: Example_Segment; mutation: acknowledged-processing.
publishStatus: PUBLISHING after 1800 s.
SEGMENT_PUBLISH_STILL_PROCESSING: Salesforce accepted the publish of segment Example_Segment and is still processing it after 1800 s (publishStatus PUBLISHING). It was not resent; read the segment later for the result.
Hint: Salesforce accepted the publish and is still processing it when --wait ran out. It did not fail and was not resent; read the segment later for the result.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PUBLISH_STILL_PROCESSING.md
```

## Related codes

- [`SEGMENT_PUBLISH_FAILED`](../segment/SEGMENT_PUBLISH_FAILED.md) — The publish ran and failed.
- [`SEGMENT_PUBLISH_STARTED`](../segment/SEGMENT_PUBLISH_STARTED.md) — `--async` returned once the publish was started.
