# `DLO_DATASPACE_COLLISION`

> The local DLO file already belongs to another data space. Retrieve into a different --output-dir or move the existing file away, then rerun.

|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Family**   | Data lake object                                           |
| **Commands** | `sf data360 retrieve`                                      |
| **Outcome**  | `blocked` for this DLO — the existing file was not changed |

## What it means

A retrieve writes each DLO to `data360/dlo/<Name>__dll.dlo-meta.json` under the output directory. A file with that name is already there, and its `identity.dataSpace` names a different data space than the DLO just read from the org.

The file name carries only the API name, so two DLOs with the same name in different data spaces would land on the same path.

## Why the plugin stops

Overwriting the file would silently swap a definition from one data space for one from another. A later deploy of that file would then target the wrong data space. The plugin keeps the existing file untouched, even with `--overwrite`.

## How to fix

1. Decide which data space the project should hold for this DLO.
2. To keep both, retrieve into a separate project with `--output-dir <other folder>`.
3. To replace the local copy, move or delete the existing `data360/dlo/<Name>__dll.dlo-meta.json` yourself, then retrieve again.

## Example output

```text
Retrieve: failed.
dlo:Orders__dll: DLO_DATASPACE_COLLISION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The local DLO file already belongs to another data space. Retrieve into a different --output-dir or move the existing file away, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_COLLISION.md
Downloaded dlo: 0
```

## Related codes

- [`DMO_DATASPACE_COLLISION`](../dmo/DMO_DATASPACE_COLLISION.md) — the same check for data model object files.
- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — the file differs but belongs to the same data space.
- [`DLO_DATASPACE_MISMATCH`](../dlo/DLO_DATASPACE_MISMATCH.md) — the data space disagreement on deploy.
