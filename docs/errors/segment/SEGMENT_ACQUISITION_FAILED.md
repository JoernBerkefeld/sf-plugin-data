# `SEGMENT_ACQUISITION_FAILED`

> The plugin could not read the segment, or a complete segment list, from the org. Check the segment name, the target org login and the Salesforce API detail in the message, then rerun.

|              |                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| **Family**   | Segment                                                                                                 |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`; `listSegments` and `resolveSegment` of `sf-plugin-data/api` |
| **Outcome**  | `failed` — nothing was written for this segment                                                         |

## What it means

The read of `segment:<Name>` at API 68 failed: Salesforce answered with an HTTP error (for example 404 when no segment has this name), or the request did not complete.

During a deploy, a missing segment (HTTP 404 `ITEM_NOT_FOUND`) is expected and leads to a create; any other read failure blocks the item with this code.

In the library functions `listSegments` and `resolveSegment` (`sf-plugin-data/api`) the code means that the segment list of a data space could not be read completely: a request failed, an answer had no `segments` list, or an entry had no API name, data space or record ID (`1sg…`). The message names the data space and, for an entry without a record ID, its API name.

## Why the plugin stops

A failed read is never taken as proof that the segment is absent or empty. No file is written from it. The library functions throw instead of returning a shorter list, so a lookup never answers `SEGMENT_NOT_FOUND` for a segment it could not read.

## How to fix

1. Check the segment name; it is the API name and case matters.
2. Check that `-o` points to the right org and that the login is still valid.
3. Read the HTTP status and Salesforce API detail in the message, fix the cause, and rerun.
4. From the library: if the message names an entry without a record ID or API name, read the segment list of that data space (`GET /services/data/v68.0/ssot/segments?dataspace=<name>`) and check the entry in Data Cloud; then call the function again.

## Example output

```text
Retrieve: failed.
segment:Example_Segment: SEGMENT_ACQUISITION_FAILED: Salesforce API rejected the request (HTTP 404); no response payload is disclosed. This component was not retrieved; no files were written for it.
Hint: The plugin could not read the segment, or a complete segment list, from the org. Check the segment name, the target org login and the Salesforce API detail in the message, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_ACQUISITION_FAILED.md
Downloaded segment: 0
```

## Related codes

- [`SEGMENT_DEPENDENCY_ACQUISITION_FAILED`](../segment/SEGMENT_DEPENDENCY_ACQUISITION_FAILED.md) — The read of the segment's DMO failed.
