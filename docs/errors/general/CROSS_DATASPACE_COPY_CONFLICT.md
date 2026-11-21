# `CROSS_DATASPACE_COPY_CONFLICT`

> The translated copy of a file would go to a path that already holds other content. Existing files are never changed, so nothing was sent. Move or remove that file, then rerun.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | General                                                  |
| **Commands** | `sf data360 deploy --allow-cross-dataspace`              |
| **Outcome**  | `blocked` — nothing was sent to the org, no file written |

## What it means

This only matters when your org has more than one data space.

A deploy with `--allow-cross-dataspace` (`-c`) writes a copy file for every translated item once it has deployed: the file as retrieve would write it, with the target data space and the new names (`data360/dmo/ds2_Order__dlm.dmo-meta.json`). Your original files never change.

A copy file goes only to a new path. If a file already exists there:

- With exactly the same content, it is reused.
- With other content, the plugin stops.

## Why the plugin stops

Writing the copy would change an existing file. The check runs before the first write of the deploy for DMOs and segments, whose names are known up front. Mappings and relationships get their names from Salesforce, so their copy is checked when it is written: an existing file with other content is left alone and the output says so.

## How to fix

1. Compare the existing file with the one you are deploying.
2. If the existing file is out of date, retrieve it again from the target data space, or move it away.
3. Rerun the deploy.

## Example output

```text
Deploy preview: blocked (CROSS_DATASPACE_COPY_CONFLICT). No deployment executed.
Data space: dataspace2.
CROSS_DATASPACE_COPY_CONFLICT: The translated copy of data360/dmo/Order__dlm.dmo-meta.json would be written to data360/dmo/ds2_Order__dlm.dmo-meta.json, but that file already exists with other content. Existing files are never changed, so nothing was sent. Move or remove that file, then rerun.
Hint: The translated copy of a file would go to a path that already holds other content. Existing files are never changed, so nothing was sent. Move or remove that file, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/CROSS_DATASPACE_COPY_CONFLICT.md
```

## Related codes

- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — retrieve would change a file that already exists.
- [`CROSS_DATASPACE_UNRESOLVED`](../general/CROSS_DATASPACE_UNRESOLVED.md) — a name in the file cannot be placed.
