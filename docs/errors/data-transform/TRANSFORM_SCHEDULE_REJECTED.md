# `TRANSFORM_SCHEDULE_REJECTED`

> The transform definition was written, but Salesforce rejected the schedule of the file. Read its message, correct the schedule in the file, then rerun the deploy.

|              |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **Family**   | Data transform                                                                    |
| **Commands** | `sf data360 deploy`                                                               |
| **Outcome**  | `failed` — the definition was written (`confirmed-created` / `confirmed-updated`) |

## What it means

The deploy created or updated the transform definition, then sent the schedule of the file with its own PUT. Salesforce answered that PUT with an HTTP 4xx status, for example `400` for a frequency it does not take (`Weekly` on a custom transform) or a `Daily` schedule without `interval`. The item is `failed` with mutation `confirmed-created` or `confirmed-updated`: the definition is in the org, the schedule is unchanged. The message carries Salesforce's answer.

## Why the plugin stops

The definition and the schedule are separate writes. The plugin reports which one Salesforce took, so the result is not read as an unknown outcome.

## How to fix

1. Read Salesforce's message in the diagnostic.
2. Correct `schedule` in the file (or remove it to leave the org schedule alone).
3. Rerun the deploy. The definition then reports no change, and only the schedule is sent.

## Example output

```text
Deploy execution: failed (TRANSFORM_SCHEDULE_REJECTED). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: confirmed-updated.
TRANSFORM_SCHEDULE_REJECTED: Salesforce API rejected the request (HTTP 400); no response payload is disclosed. Salesforce API detail: INVALID_INPUT: …. The transform definition was updated; Salesforce rejected the schedule of the file, so the schedule in the org is unchanged. Correct the schedule, then rerun the deploy.
Hint: The transform definition was written, but Salesforce rejected the schedule of the file. Read its message, correct the schedule in the file, then rerun the deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_SCHEDULE_REJECTED.md
```

## Related codes

- [`TRANSFORM_SCHEDULE_CHANGE`](../data-transform/TRANSFORM_SCHEDULE_CHANGE.md) — the deploy sends the schedule of the file.
- [`TRANSFORM_SERVER_PROCESSING`](../data-transform/TRANSFORM_SERVER_PROCESSING.md) — the written transform is still processing.
