# `OVERWRITE_REQUIRED`

> A file of that name already exists in the project with other content. A deploy never changes an existing file when it writes a cross-data-space copy: compare the two, then move or remove the existing file and rerun.

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| **Family**   | General                                                   |
| **Commands** | `sf data360 deploy --allow-cross-dataspace`               |
| **Outcome**  | the copy file is `not-written`; the existing file is kept |

## What it means

This only matters when your org has more than one data space.

After a deploy with `--allow-cross-dataspace`, the plugin writes a copy file for every translated item: the file as retrieve would write it, with the target data space and the new names. A copy goes only to a new path. When a file with the same name but other content is already there, the copy is not written and the output names the file. A file with exactly the same content is reused.

A retrieve never reports this code: it replaces a local file whose content differs from the org, and leaves identical files `unchanged`.

## Why the plugin stops

Writing the copy would change a file you already have. The deploy itself is done; only the copy file is missing.

## How to fix

1. Compare the existing file with the one you deployed.
2. If the existing file is out of date, move or remove it, or retrieve it again from the target data space.
3. Rerun the deploy, or retrieve the translated items from the target data space.

## Example output

The deploy names the file in its copy lines instead of printing the code:

```text
Copy file not written for data360/mapping/Order_map.mapping-meta.json: a file of that name already exists with other content; existing files are never changed.
```

## Related codes

- [`CROSS_DATASPACE_COPY_CONFLICT`](../general/CROSS_DATASPACE_COPY_CONFLICT.md) — the same conflict found before the first write of a deploy.
- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — the file changed while it was being written.
- [`UNSAFE_PATH`](../general/UNSAFE_PATH.md) — the file location is not safe to write to.
