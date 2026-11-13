# `OVERWRITE_REQUIRED`

> A different version of this file already exists in the project. Compare it with the org, then rerun with --overwrite (-x) to replace it, or keep your local file.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | General                                                         |
| **Commands** | `sf data360 retrieve`                                           |
| **Outcome**  | `blocked` — the existing file was kept; the org was not changed |

## What it means

The retrieved definition differs from the file already in the project, and `--overwrite` was not given. When the content is identical, the item reports `unchanged` and no flag is needed.

Other components of the same run are still retrieved.

## Why the plugin stops

Your local file may hold edits that are not deployed yet. The plugin never replaces it without your explicit consent.

## How to fix

1. Compare the local file with the org, for example by retrieving into an empty folder with `--output-dir`.
2. If the org version is the one you want, rerun with `--overwrite` (or `-x`).
3. If your local version is newer, deploy it instead.

## Example output

```text
Retrieve: blocked.
Downloaded dmo:Account__dlm (retrieved).
dmo:Customer__dlm: OVERWRITE_REQUIRED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: A different version of this file already exists in the project. Compare it with the org, then rerun with --overwrite (-x) to replace it, or keep your local file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/OVERWRITE_REQUIRED.md
Downloaded dmo: 1
```

## Related codes

- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — the file changed while it was being written.
- [`UNSAFE_PATH`](../general/UNSAFE_PATH.md) — the file location is not safe to write to.
