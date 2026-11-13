# `UNSUPPORTED_TRANSFORM_OWNER_OR_STATE`

> The data transform is not a custom batch transform in the default data space with status ACTIVE. Wait until it is active, or manage this transform in Data Cloud.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The transform read from the org is not a custom (user-created) batch transform in the default data space, its status is not `ACTIVE`, or its record ID is not valid. A transform that is still `PROCESSING` is only accepted when the plugin reads it back right after its own write.

## Why the plugin stops

Transforms created by the platform or a package, streaming transforms, and transforms that are still processing or in an error state follow rules the plugin does not check. It leaves them alone instead of guessing.

## How to fix

1. Open the transform in Data Cloud and check its type, data space and status.
2. If it is still processing, wait until it is active and rerun.
3. Otherwise manage this transform in Data Cloud.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: UNSUPPORTED_TRANSFORM_OWNER_OR_STATE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform is not a custom batch transform in the default data space with status ACTIVE. Wait until it is active, or manage this transform in Data Cloud.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_OWNER_OR_STATE.md
Downloaded data-transform: 0
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_VARIANT`](../data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md) — the transform has extra definitions, schedules or a namespace.
- [`UNSUPPORTED_TRANSFORM_INPUT`](../data-transform/UNSUPPORTED_TRANSFORM_INPUT.md) — the transform logic is outside the supported shape.
