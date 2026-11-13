# `TRANSFORM_DELETE_UNCONFIRMED`

> The DELETE was sent but its result could not be confirmed. Do not rerun the delete; check in Data Cloud whether the transform still exists.

|              |                                                                         |
| ------------ | ----------------------------------------------------------------------- |
| **Family**   | Data transform                                                          |
| **Commands** | `sf data360 delete`                                                     |
| **Outcome**  | `deletion-unconfirmed` — the transform may or may not have been deleted |

## What it means

The DELETE request was sent. Afterwards the plugin either got an error for the request itself, could not read the full transform list again, saw that the transform is still listed, or found that the source or output DLO changed. The item mutation is `unknown` when the request errored and `acknowledged` when Salesforce accepted it.

## Why the plugin stops

An error does not prove the delete failed, and an accepted request does not prove it finished. The plugin does not retry, because sending a second DELETE without knowing the first result is unsafe.

## How to fix

1. Open Data Cloud and check whether the data transform is still there.
2. Check that the source and output DLOs are unchanged.
3. If the transform still exists and you still want to delete it, rerun the delete after it has settled.

## Example output

```text
Delete: failed.
Unconfirmed: data-transform:Orders_Copy; mutation: acknowledged.
TRANSFORM_DELETE_UNCONFIRMED: DELETE outcome is not confirmed. Do not replay; reconcile by reading the Transform inventory before any further action.
Hint: The DELETE was sent but its result could not be confirmed. Do not rerun the delete; check in Data Cloud whether the transform still exists.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DELETE_UNCONFIRMED.md
```

## Related codes

- [`INCOMPLETE_TRANSFORM_INVENTORY`](../data-transform/INCOMPLETE_TRANSFORM_INVENTORY.md) — the same list check, failing before the DELETE was sent.
- [`TRANSFORM_DELETE_CONFIRMATION_REQUIRED`](../data-transform/TRANSFORM_DELETE_CONFIRMATION_REQUIRED.md) — the delete was not confirmed, so nothing was sent.
