# `PARTIAL_RELATIONSHIP_OUTPUT`

> The relationship file was written, but a later step of saving it failed, so the file may not be complete. Inspect it under data360/relationship and retrieve again with --overwrite.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Relationship                                                         |
| **Commands** | `sf data360 retrieve`                                                |
| **Outcome**  | `failed` — the local file may be incomplete; the org was not changed |

## What it means

The plugin writes `data360/relationship/<Name>.relationship-meta.json` through a staged file. The file had already been placed at its destination when a later step failed, for example the final read-back or the cleanup of the staged copy.

## Why the plugin stops

Once a file has been placed, the plugin cannot claim that nothing was written. It reports the partial state so you check the file.

## How to fix

1. Open the file and check that it is complete JSON.
2. Make sure no other process writes to the project folder.
3. Retrieve the source DMO's relationships again with `--overwrite`.

## Example output

```text
Retrieve: failed.
relationship:Order_CustomerId_map_Customer_Id_1794467679481: PARTIAL_RELATIONSHIP_OUTPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Relationship retrieval did not complete for this item; the org was not changed.
Hint: The relationship file was written, but a later step of saving it failed, so the file may not be complete. Inspect it under data360/relationship and retrieve again with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/PARTIAL_RELATIONSHIP_OUTPUT.md
Downloaded relationship: 0
```

## Related codes

- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — Saving failed before any file was placed.
- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — The file changed while the plugin was writing it.
