# `SEGMENT_ACQUISITION_FAILED`

> The plugin could not read the segment from the org. Check the segment name, the target org login and the Salesforce API detail in the message, then rerun the retrieve.

|              |                                                 |
| ------------ | ----------------------------------------------- |
| **Family**   | Segment                                         |
| **Commands** | `sf data360 retrieve`                           |
| **Outcome**  | `failed` — nothing was written for this segment |

## What it means

The read of `segment:<Name>` at API 68 failed: Salesforce answered with an HTTP error (for example 404 when no segment has this name), or the request did not complete.

During a deploy, a missing segment is expected and leads to a create; other read failures there are reported as `SEGMENT_CREATE_AND_TARGET_UNQUALIFIED`.

## Why the plugin stops

A failed read is never taken as proof that the segment is absent or empty. No file is written from it.

## How to fix

1. Check the segment name; it is the API name and case matters.
2. Check that `-o` points to the right org and that the login is still valid.
3. Read the HTTP status and Salesforce API detail in the message, fix the cause, and rerun.

## Example output

```text
Retrieve: failed.
segment:Example_Segment: SEGMENT_ACQUISITION_FAILED: Salesforce API rejected the request (HTTP 404); no response payload is disclosed. This component was not retrieved; no files were written for it.
Hint: The plugin could not read the segment from the org. Check the segment name, the target org login and the Salesforce API detail in the message, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_ACQUISITION_FAILED.md
Downloaded segment: 0
```

## Related codes

- [`SEGMENT_CREATE_AND_TARGET_UNQUALIFIED`](../segment/SEGMENT_CREATE_AND_TARGET_UNQUALIFIED.md) — The same kind of read failure during a deploy.
- [`SEGMENT_DEPENDENCY_ACQUISITION_FAILED`](../segment/SEGMENT_DEPENDENCY_ACQUISITION_FAILED.md) — The read of the segment's DMO failed.
