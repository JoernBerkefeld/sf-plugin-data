# `SEGMENT_DEPENDENCY_ACQUISITION_FAILED`

> The plugin could not read the DMO this segment is built on. Check that the DMO exists in the org, that the login works and the API detail in the message, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Segment                                                         |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`                      |
| **Outcome**  | `failed` on retrieve, `blocked` on deploy — nothing was changed |

## What it means

Every segment is built on one DMO (`spec.segmentOn`). The plugin reads that DMO once through the Data Cloud API at API 68 to bind the segment to its ID in the target. That read failed.

## Why the plugin stops

Without the DMO's ID, the plugin cannot check that the segment read back after a write is built on that DMO, so it neither saves nor deploys it.

## How to fix

1. Check that the DMO named in the segment exists in the org, in the default data space.
2. Check the login of `-o` and read the HTTP status in the message.
3. Rerun the command.

## Example output

```text
Retrieve: failed.
segment:Example_Segment: SEGMENT_DEPENDENCY_ACQUISITION_FAILED: Salesforce API rejected the request (HTTP 404); no response payload is disclosed. This component was not retrieved; no files were written for it.
Hint: The plugin could not read the DMO this segment is built on. Check that the DMO exists in the org, that the login works and the API detail in the message, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DEPENDENCY_ACQUISITION_FAILED.md
Downloaded segment: 0
```

## Related codes

- [`SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING`](../segment/SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING.md) — The read returned no DMO of that exact name.
