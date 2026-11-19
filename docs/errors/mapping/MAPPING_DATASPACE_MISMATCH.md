# `MAPPING_DATASPACE_MISMATCH`

> The mapping file's c__dataSpace is not the data space of the run. Run with the --dataspace the file names, or correct c__dataSpace.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Each mapping file names the data space it belongs to in its top-level `c__dataSpace` key. This command runs in the data space given by `--dataspace`, or `default` when the flag is not set, and the two differ. A deploy refuses the file, and so does a delete of a mapping whose file (or, with `--changed-since`, whose deleted file) names another data space.

## Why the plugin stops

Deploying a mapping into a data space it was not written for could bind objects of the wrong data space. The plugin requires them to agree.

## How to fix

1. Check `c__dataSpace` in the mapping file.
2. Run with that data space in `--dataspace`. Files of different data spaces go in separate runs.
3. Rerun with `--preview`.

## Example output

```text
Deploy preview: blocked (MAPPING_DATASPACE_MISMATCH). No deployment executed.
MAPPING_DATASPACE_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The mapping file's c__dataSpace is not the data space of the run. Run with the --dataspace the file names, or correct c__dataSpace.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DATASPACE_MISMATCH.md
```

## Related codes

- [`UNSUPPORTED_MAPPING_DATASPACE`](../mapping/UNSUPPORTED_MAPPING_DATASPACE.md) — Salesforce reported the mapping in another data space.
