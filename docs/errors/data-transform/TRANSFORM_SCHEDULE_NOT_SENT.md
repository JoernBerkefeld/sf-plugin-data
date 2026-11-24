# `TRANSFORM_SCHEDULE_NOT_SENT`

> The transform definition was written, but the transform was still processing at the end of the wait, so its schedule was not sent. Wait until it is ACTIVE, then rerun the deploy.

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| **Family**   | Data transform                                                                                       |
| **Commands** | `sf data360 deploy`                                                                                  |
| **Outcome**  | `processing` (exit code 69) — the definition was written (`confirmed-created` / `confirmed-updated`) |

## What it means

The deploy created or updated the transform definition, and the file has a schedule that differs from the org. A transform answers `PROCESSING` after a definition write, and Salesforce refuses a schedule PUT on a transform that is not active (`400 INVALID_STATUS`). The plugin read the transform every 5 seconds for up to 5 minutes, and it was still `PROCESSING`, so the schedule PUT was not sent. The item is `failed` with mutation `confirmed-created` or `confirmed-updated`: the definition is in the org, the schedule is unchanged.

The run counts this item as still processing, not as failed. When nothing else failed, the deploy status is `processing` and the exit code is 69. When another item failed or was blocked, that wins (exit code 1, or 68 for `partial` when something was written).

## Why the plugin stops

Sending the schedule while the transform is processing would only be refused. The plugin stops instead and says exactly what was written.

## How to fix

1. Check the transform status in Data Cloud and wait until it is `ACTIVE`.
2. Rerun the same deploy. The definition then reports no change, and only the schedule is sent.

## Example output

```text
Deploy execution: processing (TRANSFORM_SCHEDULE_NOT_SENT). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: confirmed-updated.
TRANSFORM_SCHEDULE_NOT_SENT: The transform definition was updated, but the transform was still processing at the end of the wait, so the schedule was not sent. Rerun the deploy once the transform is ACTIVE.
Hint: The transform definition was written, but the transform was still processing at the end of the wait, so its schedule was not sent. Wait until it is ACTIVE, then rerun the deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_SCHEDULE_NOT_SENT.md
```

## Related codes

- [`TRANSFORM_SCHEDULE_CHANGE`](../data-transform/TRANSFORM_SCHEDULE_CHANGE.md) — the deploy sends the schedule of the file.
- [`TRANSFORM_SERVER_PROCESSING`](../data-transform/TRANSFORM_SERVER_PROCESSING.md) — the written transform is still processing.
