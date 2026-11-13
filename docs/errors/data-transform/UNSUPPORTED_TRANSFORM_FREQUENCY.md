# `UNSUPPORTED_TRANSFORM_FREQUENCY`

> The data transform full run frequency is not DAILY, which the plugin does not support. Set it to daily in Data Cloud or manage this transform there.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The transform read from the org has a `fullRunFrequency` other than `DAILY`.

## Why the plugin stops

The plugin only handles transforms with the daily full run setting. Other settings are not carried in the local file, so a deploy or retrieve could silently lose or change them.

## How to fix

1. Open the transform in Data Cloud and check its full run frequency.
2. Set it to daily if that fits your use, or keep managing this transform in Data Cloud.
3. Rerun the command.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: UNSUPPORTED_TRANSFORM_FREQUENCY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform full run frequency is not DAILY, which the plugin does not support. Set it to daily in Data Cloud or manage this transform there.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_FREQUENCY.md
Downloaded data-transform: 0
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_SCHEDULE`](../data-transform/UNSUPPORTED_TRANSFORM_SCHEDULE.md) — the transform has a schedule.
- [`UNSUPPORTED_TRANSFORM_VARIANT`](../data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md) — the transform uses another unsupported form.
