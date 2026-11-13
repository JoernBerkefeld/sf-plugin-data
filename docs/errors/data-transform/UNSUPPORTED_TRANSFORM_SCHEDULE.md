# `UNSUPPORTED_TRANSFORM_SCHEDULE`

> The data transform has a schedule, which the plugin does not support. Remove the schedule in Data Cloud, or manage this transform there.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The plugin reads the transform schedule separately and expects no schedule at all (frequency and type `None`). This transform has a schedule, or its definition contains schedule settings.

## Why the plugin stops

Schedules are not part of the local file and the plugin never writes them. Handling a scheduled transform could change when it runs without you noticing.

## How to fix

1. Open the transform in Data Cloud and check its schedule.
2. Remove the schedule if you want to manage the transform with the plugin, or keep managing it in Data Cloud.
3. Rerun the command.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: UNSUPPORTED_TRANSFORM_SCHEDULE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform has a schedule, which the plugin does not support. Remove the schedule in Data Cloud, or manage this transform there.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_SCHEDULE.md
Downloaded data-transform: 0
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_FREQUENCY`](../data-transform/UNSUPPORTED_TRANSFORM_FREQUENCY.md) — the full run frequency is not daily.
- [`UNSUPPORTED_TRANSFORM_VARIANT`](../data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md) — the transform uses another unsupported form.
