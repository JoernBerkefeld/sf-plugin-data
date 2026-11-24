# `SEGMENT_PUBLISH_STARTED`

> With --async the publish was started and Salesforce accepted it; the command did not wait for the result. Read the segment later for its publish status; nothing was resent.

|              |                                                                                    |
| ------------ | ---------------------------------------------------------------------------------- |
| **Family**   | Segment                                                                            |
| **Commands** | `sf data360 publish`                                                               |
| **Outcome**  | `accepted` — outcome `publishing`, mutation `acknowledged-processing`; exit code 0 |

## What it means

`--async` was set, so the plugin sent the one publish request, Salesforce accepted it, and the command returned at once. The segment was not read afterwards: the publish was started, not finished. A publish can take many minutes.

## Why the plugin reports it

The result of the publish is not known yet. It is neither a success nor a failure, and publishing again would start a second job. With `--async` you asked not to wait, so the status is `accepted` and the exit code is 0.

## How to fix

1. Do not run the publish again just because of this message.
2. Read the segment later, for example `sf data360 retrieve -m segment:<Name> --output-dir <scratch>` or in Data Cloud, until its publish status is SUCCESS or FAILED.
3. To wait for the result instead, run the publish without `--async` (optionally with `--wait-timeout`).

## Example output

```text
Publish: accepted.
publishing: Example_Segment; mutation: acknowledged-processing.
publishStatus: PUBLISHING.
SEGMENT_PUBLISH_STARTED: Salesforce accepted the publish of segment Example_Segment; it was started without waiting (--async) and runs on in Salesforce. It was not resent; read the segment later for the result.
Hint: With --async the publish was started and Salesforce accepted it; the command did not wait for the result. Read the segment later for its publish status; nothing was resent.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PUBLISH_STARTED.md
```

## Related codes

- [`SEGMENT_PUBLISH_STILL_PROCESSING`](../segment/SEGMENT_PUBLISH_STILL_PROCESSING.md) — the publish was still running when `--wait-timeout` ran out.
- [`SEGMENT_PUBLISH_FAILED`](../segment/SEGMENT_PUBLISH_FAILED.md) — the publish ran and failed.
