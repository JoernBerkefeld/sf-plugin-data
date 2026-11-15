# `UNSUPPORTED_TRANSFORM_VARIANT`

> The data transform has a namespace from a package, which the plugin does not manage: retrieve writes it as-is, deploy and delete refuse it; manage it through its package.

|              |                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data transform                                                                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                              |
| **Outcome**  | retrieve: `success`, the file is written as-is (verbatim) with a warning; deploy and delete: `blocked` — nothing was changed |

## What it means

The transform record read from the org has a namespace, which means it comes from a managed package.

## Why the plugin stops

Packaged transforms are owned by the package, so deploy and delete leave them alone.

Retrieve does not stop: it writes the transform GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`. Deploy skips that file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## How to fix

1. Check in Data Cloud which package the transform comes from.
2. Manage it through that package.

## Example output

```text
Retrieve: success.
Warning: data-transform:Orders_Copy: retrieved as-is (verbatim, reason UNSUPPORTED_TRANSFORM_VARIANT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-transform:Orders_Copy (retrieved).
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_OWNER_OR_STATE`](../data-transform/UNSUPPORTED_TRANSFORM_OWNER_OR_STATE.md) — the transform is not a custom transform.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
