# `UNSUPPORTED_SEGMENT_VARIANT`

> The segment has parameters (no write takes them), schedule details the plugin does not know, UI criteria that are not a JSON object or no DMO source. Retrieve writes it as-is; deploy refuses it.

|              |                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Family**   | Segment                                                                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`                                                                   |
| **Outcome**  | retrieve: `success` — the segment is written as-is (verbatim) with a warning; deploy: `blocked` for the file |

## What it means

The segment file holds segments of every type built on a DMO of the segment's own data space (`c__dataSpace`): SQL (DBT) segments with their models, segments built in the segment canvas (`UI`) with their criteria as a JSON object, and other types (for example Waterfall or Dynamic). Lookback and refresh schedule are part of the file and sent as written.

This segment has something the file cannot hold:

- parameters (a non-empty `parameters` list): Salesforce has no write for them, it refuses the key on create;
- schedule details the plugin does not know: another key in `publishScheduleInfo`, a `frequency` that is not text or a `daysOfWeek` that is not a list (a deploy does not need this: a file without `schedule` updates such a segment and keeps its schedule);
- UI criteria that are not a JSON object;
- a DBT segment without its DBT configuration;
- a source that is not a DMO (`__dlm`).

The SQL and the criteria themselves are not checked; Salesforce decides about them.

## Why the plugin reports it

A deploy could not write what the file leaves out, so the segment in the target org would differ from the source without notice. Retrieve therefore writes such a segment as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, and no SQL files; SQL files left from an earlier retrieve are removed. Deploy refuses a file whose identity or source is not an API name or DMO and names the key, for example `spec.segmentOn`.

## How to fix

1. Manage this segment in Data Cloud; a verbatim file records it but cannot be deployed.
2. To deploy it with the plugin, remove what the file cannot hold in the org and retrieve it again; the normal file and its SQL files replace the verbatim one.

Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## Example output

```text
Retrieve: success.
Warning: segment:Example_Segment: retrieved as-is (verbatim, reason UNSUPPORTED_SEGMENT_VARIANT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded segment:Example_Segment (retrieved).
```

## Related codes

- [`UNKNOWN_SEGMENT_CONFIGURATION`](../segment/UNKNOWN_SEGMENT_CONFIGURATION.md) — The segment has settings the plugin does not know.
- [`INVALID_SEGMENT_DOCUMENT`](../segment/INVALID_SEGMENT_DOCUMENT.md) — A value is not text the plugin can keep.
- [`SEGMENT_SCHEDULE_CHANGE`](../segment/SEGMENT_SCHEDULE_CHANGE.md) — a schedule the deploy sends.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
