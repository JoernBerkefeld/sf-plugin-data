# `DMO_DATASPACE_COLLISION`

> The local DMO file already belongs to another data space. Retrieve into a different --output-dir or move the existing file away, then rerun.

|              |                                                                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                                                                     |
| **Commands** | `sf data360 retrieve`, `sf data360 delete`                                                                                            |
| **Outcome**  | `blocked` for this DMO on retrieve — the existing file was not changed; on `delete --field` it is the reason a file was not refreshed |

## What it means

A retrieve writes each data model object to `data360/dmo/<Name>__dlm.dmo-meta.json` under the output directory. A file with that name is already there, and its `identity.dataSpace` names a different data space than the DMO just read from the org.

`sf data360 delete --field` refreshes existing DMO files after a confirmed field removal; when the file belongs to another data space it is left alone and the refresh line shows this code.

## Why the plugin stops

The file name carries only the API name. Overwriting the file would replace a definition from one data space with one from another, and a later deploy would target the wrong data space. The plugin keeps the existing file, even with `--overwrite`.

## How to fix

1. Decide which data space this project should hold for the DMO.
2. To keep both, retrieve into another project with `--output-dir <other folder>`.
3. To replace the local copy, move or delete the existing file yourself, then retrieve again.

## Example output

```text
Retrieve: failed.
dmo:Customer__dlm: DMO_DATASPACE_COLLISION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The local DMO file already belongs to another data space. Retrieve into a different --output-dir or move the existing file away, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_DATASPACE_COLLISION.md
Downloaded dmo: 0
```

## Related codes

- [`DLO_DATASPACE_COLLISION`](../dlo/DLO_DATASPACE_COLLISION.md) — the same check for data lake object files.
- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — the file differs but belongs to the same data space.
- [`LOCAL_REFRESH_FAILED`](../general/LOCAL_REFRESH_FAILED.md) — a field delete could not refresh a project file.
