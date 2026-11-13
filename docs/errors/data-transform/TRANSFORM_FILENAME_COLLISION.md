# `TRANSFORM_FILENAME_COLLISION`

> Another file in data360/dataTransforms differs only in case or trailing spaces, or holds a different transform. Rename or remove that file, then rerun the retrieve.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Data transform                                                 |
| **Commands** | `sf data360 retrieve`                                          |
| **Outcome**  | `failed` — no file was written; nothing in the org was changed |

## What it means

Retrieve wanted to write `data360/dataTransforms/<Name>.dataTransform.json`, but the folder already has a file whose name only differs in upper or lower case or in trailing spaces or dots, or the existing file at that path describes a transform with a different API name.

## Why the plugin stops

On many file systems such names point to the same file. Writing anyway could overwrite the wrong transform or leave two files that look like the same one.

## How to fix

1. List `data360/dataTransforms/` and find the conflicting file.
2. Rename or delete it so that only the exact `<Name>.dataTransform.json` remains for this transform.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: TRANSFORM_FILENAME_COLLISION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: Another file in data360/dataTransforms differs only in case or trailing spaces, or holds a different transform. Rename or remove that file, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_FILENAME_COLLISION.md
Downloaded data-transform: 0
```

## Related codes

- [`PARTIAL_TRANSFORM_OUTPUT`](../data-transform/PARTIAL_TRANSFORM_OUTPUT.md) — the file was written but could not be verified.
