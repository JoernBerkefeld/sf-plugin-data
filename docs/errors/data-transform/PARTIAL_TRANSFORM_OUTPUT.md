# `PARTIAL_TRANSFORM_OUTPUT`

> The transform file was written, but the final check of its contents failed. Open data360/dataTransforms/<Name>.dataTransform.json, then rerun the retrieve with --overwrite.

|              |                                                                                 |
| ------------ | ------------------------------------------------------------------------------- |
| **Family**   | Data transform                                                                  |
| **Commands** | `sf data360 retrieve`                                                           |
| **Outcome**  | `failed` — the local file may have been written; nothing in the org was changed |

## What it means

Retrieve stages the transform file in a temporary folder and then moves it into `data360/dataTransforms/`. The move happened, but reading the file back afterwards did not give the expected bytes, or another error came up after the file was already in place.

## Why the plugin stops

The plugin cannot promise that the file on disk is the definition it read from the org. It reports the partial state instead of claiming a clean retrieve.

## How to fix

1. Open `data360/dataTransforms/<Name>.dataTransform.json` and check whether it is complete and valid JSON.
2. Make sure no editor, sync tool or other process is writing to that folder.
3. Rerun `sf data360 retrieve --metadata data-transform:<Name> --overwrite`.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: PARTIAL_TRANSFORM_OUTPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The transform file was written, but the final check of its contents failed. Open data360/dataTransforms/<Name>.dataTransform.json, then rerun the retrieve with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/PARTIAL_TRANSFORM_OUTPUT.md
Downloaded data-transform: 0
```

## Related codes

- [`TRANSFORM_FILENAME_COLLISION`](../data-transform/TRANSFORM_FILENAME_COLLISION.md) — the file could not be written because of a conflicting name.
