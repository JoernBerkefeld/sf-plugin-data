# `TRANSFORM_SCHEDULE_CHANGE`

> The deploy sends the schedule of the file, so the transform runs on that schedule in the target org ({ "frequency": "None" } turns it off). Remove the schedule key from the file to leave the org schedule alone.

|              |                                                                           |
| ------------ | ------------------------------------------------------------------------- |
| **Family**   | Data transform                                                            |
| **Commands** | `sf data360 deploy`                                                       |
| **Outcome**  | informational — preview and deploy outcomes and exit status are unchanged |

## What it means

The transform file has a `schedule` key, and it differs from the schedule the transform has in the target org (a new transform has none). Preview reports that the deploy will send it; a deploy sends it with the schedule PUT after the definition and reports this notice beside `created` or `updated`.

Retrieve writes the schedule the transform has in the source org (a transform without a schedule gets no `schedule` key). Deploying that file to another org therefore makes the transform run there on the same schedule. An explicit `{ "frequency": "None" }` in the file turns the target org's schedule off.

## Why the plugin reports it

A schedule starts transform runs, which load data into the output DLOs of the target org. The notice makes that visible before and after the deploy, so a schedule copied from a development org does not start runs unnoticed.

## How to fix

1. No fix is needed when the transform should run on that schedule in the target org.
2. To keep the target org's schedule as it is, remove the `schedule` key from the file before the deploy. A file without `schedule` never changes the schedule.
3. To turn the schedule off, set `"schedule": { "frequency": "None" }`.

## Example output

```text
Deploy preview: success.
update data-transform Orders_Copy
TRANSFORM_SCHEDULE_CHANGE: The schedule of the file (Daily) replaces the transform schedule in this org; the transform then runs on it there.
Hint: The deploy sends the schedule of the file, so the transform runs on that schedule in the target org ({ "frequency": "None" } turns it off). Remove the schedule key from the file to leave the org schedule alone.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_SCHEDULE_CHANGE.md
```

## Related codes

- [`TRANSFORM_PREVIEW_LIMITATIONS`](../data-transform/TRANSFORM_PREVIEW_LIMITATIONS.md) — what a transform preview does not check.
- [`TRANSFORM_READBACK_MISMATCH`](../data-transform/TRANSFORM_READBACK_MISMATCH.md) — the schedule read back after the PUT has another frequency.
