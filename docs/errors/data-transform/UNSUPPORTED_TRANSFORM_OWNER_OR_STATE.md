# `UNSUPPORTED_TRANSFORM_OWNER_OR_STATE`

> The data transform is not a custom transform (creationType CUSTOM) with a valid record ID. The plugin only manages custom transforms; manage this one in Data Cloud.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The transform read from the org does not have `creationType` `CUSTOM`, or its record ID is not a data transform ID (`1dt` followed by 15 letters or digits).

## Why the plugin stops

Transforms created by the platform, for example for data graphs or identity resolution, are owned by the feature that made them. Changing or deleting them from a local file could break that feature, so the plugin leaves them alone.

## How to fix

1. Open the transform in Data Cloud and check how it was created.
2. Manage platform-created transforms through the feature that owns them.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: UNSUPPORTED_TRANSFORM_OWNER_OR_STATE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform is not a custom transform (creationType CUSTOM) with a valid record ID. The plugin only manages custom transforms; manage this one in Data Cloud.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_OWNER_OR_STATE.md
Downloaded data-transform: 0
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_VARIANT`](../data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md) — the transform comes from a package.
- [`UNSUPPORTED_TRANSFORM_INPUT`](../data-transform/UNSUPPORTED_TRANSFORM_INPUT.md) — the transform input fails the basic file checks.
