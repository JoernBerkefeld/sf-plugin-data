# `SEGMENT_SCHEDULE_CHANGE`

> The deploy sends the schedule of the file, so the segment publishes on that schedule in the target org ({ "frequency": "None" } turns it off). Remove the schedule key from the file to leave the org schedule alone.

|              |                                                                           |
| ------------ | ------------------------------------------------------------------------- |
| **Family**   | Segment                                                                   |
| **Commands** | `sf data360 deploy`                                                       |
| **Outcome**  | informational — preview and deploy outcomes and exit status are unchanged |

## What it means

The segment file has a `schedule` key, and a key it states differs from the refresh schedule the segment has in the target org (a new segment has none; keys the file leaves out keep their org value). Preview reports that the deploy will send it; a deploy sends it with the create or the PATCH and reports this notice beside `created` or `updated`.

Retrieve writes the schedule the segment has in the source org (a segment that does not refresh gets no `schedule` key). Deploying that file to another org therefore makes the segment publish there on the same schedule. An explicit `{ "frequency": "None" }` in the file turns the target org's schedule off. Salesforce does that for a UI segment; for a DBT segment it refuses every way to clear the schedule, and the deploy reports that answer as `rejected` (only deleting the segment removes the schedule).

Salesforce does not read the time of a schedule back, so a change of `time` alone is not compared and not sent.

## Why the plugin reports it

A schedule starts segment publishes, which recompute the segment members in the target org. The notice makes that visible before and after the deploy, so a schedule copied from a development org does not start publishes unnoticed.

## How to fix

1. No fix is needed when the segment should publish on that schedule in the target org.
2. To keep the target org's schedule as it is, remove the `schedule` key from the file before the deploy. A file without `schedule` never changes the schedule.
3. To turn the schedule of a UI segment off, set `"schedule": { "frequency": "None" }`.

## Example output

```text
Deploy preview: success.
update segment Example_Segment
SEGMENT_SCHEDULE_CHANGE: The schedule of the file (Weekly) replaces the segment refresh schedule in this org; the segment then publishes on it there.
Hint: The deploy sends the schedule of the file, so the segment publishes on that schedule in the target org ({ "frequency": "None" } turns it off). Remove the schedule key from the file to leave the org schedule alone.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_SCHEDULE_CHANGE.md
```

## Related codes

- [`SEGMENT_READBACK_MISMATCH`](../segment/SEGMENT_READBACK_MISMATCH.md) — the segment read back after the write holds another schedule than sent.
- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — a refresh the file cannot hold.
