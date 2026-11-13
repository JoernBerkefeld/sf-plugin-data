# `RELATIONSHIP_DATASPACE_COLLISION`

> A local file with this relationship name was saved from a different data space. Retrieve into a separate project folder, or remove the old file first.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Relationship                                                  |
| **Commands** | `sf data360 retrieve`                                         |
| **Outcome**  | `failed` — this file was not written; the org was not changed |

## What it means

The retrieve would write `data360/relationship/<Name>.relationship-meta.json`, but a file with that name exists and its `identity.dataSpace` differs from the data space of this retrieve (`--dataspace`, or the default).

## Why the plugin stops

Both relationships would share one file name. Overwriting would silently replace the definition from the other data space, even with `--overwrite`.

## How to fix

1. Retrieve each data space into its own project folder with `--output-dir`.
2. Or remove or move the existing file if it is no longer needed, then retrieve again.

## Example output

```text
Retrieve: failed.
relationship:Order_CustomerId_map_Customer_Id_1794467679481: RELATIONSHIP_DATASPACE_COLLISION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Relationship retrieval did not complete for this item; the org was not changed.
Hint: A local file with this relationship name was saved from a different data space. Retrieve into a separate project folder, or remove the old file first.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_DATASPACE_COLLISION.md
Downloaded relationship: 0
```

## Related codes

- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — The same data space, but the file differs.
- [`UNSUPPORTED_RELATIONSHIP_DATASPACE`](../relationship/UNSUPPORTED_RELATIONSHIP_DATASPACE.md) — The data space mismatch on deploy and delete.
