# `UNSUPPORTED_TRANSFORM_VARIANT`

> The data transform has extra definitions, schedules or a namespace from a package, which the plugin does not support. Manage this transform in Data Cloud.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The transform record read from the org contains `definitions`, `schedule` or `schedules` properties, or has a namespace, which means it comes from a managed package.

## Why the plugin stops

These forms carry settings the local file cannot express, and packaged transforms are owned by the package. The plugin leaves them alone.

## How to fix

1. Check in Data Cloud whether the transform comes from a package or uses several definitions or schedules.
2. Manage such transforms in Data Cloud or through the package that owns them.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: UNSUPPORTED_TRANSFORM_VARIANT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform has extra definitions, schedules or a namespace from a package, which the plugin does not support. Manage this transform in Data Cloud.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md
Downloaded data-transform: 0
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_OWNER_OR_STATE`](../data-transform/UNSUPPORTED_TRANSFORM_OWNER_OR_STATE.md) — the transform type, owner or status is not supported.
- [`UNSUPPORTED_TRANSFORM_SCHEDULE`](../data-transform/UNSUPPORTED_TRANSFORM_SCHEDULE.md) — the transform has a schedule.
