# `UNSUPPORTED_TRANSFORM_OWNER_OR_STATE`

> The data transform is not a custom transform (creationType CUSTOM) with a valid record ID. The plugin only manages custom transforms: retrieve writes it as-is, deploy and delete refuse it; manage it in Data Cloud.

|              |                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data transform                                                                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                              |
| **Outcome**  | retrieve: `success`, the file is written as-is (verbatim) with a warning; deploy and delete: `blocked` — nothing was changed |

## What it means

The transform read from the org does not have `creationType` `CUSTOM`, or its record ID is not a data transform ID (`1dt` followed by 15 letters or digits).

## Why the plugin stops

Transforms created by the platform, for example for data graphs or identity resolution, are owned by the feature that made them. Changing or deleting them from a local file could break that feature, so deploy and delete leave them alone.

Retrieve does not stop: it writes the transform GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, so nothing in the org is hidden. Deploy skips that file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## How to fix

1. Open the transform in Data Cloud and check how it was created.
2. Manage platform-created transforms through the feature that owns them.

## Example output

```text
Retrieve: success.
Warning: data-transform:Orders_Copy: retrieved as-is (verbatim, reason UNSUPPORTED_TRANSFORM_OWNER_OR_STATE) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-transform:Orders_Copy (retrieved).
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_VARIANT`](../data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md) — the transform comes from a package.
- [`UNSUPPORTED_TRANSFORM_INPUT`](../data-transform/UNSUPPORTED_TRANSFORM_INPUT.md) — the transform input fails the basic file checks.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
