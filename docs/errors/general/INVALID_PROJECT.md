# `INVALID_PROJECT`

> sfdx-project.json does not name one usable package directory. Give packageDirectories exactly one default entry with a relative path inside the project, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | General                                                         |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — no file was written; the org was not changed        |

## What it means

Segments, calculated insights, identity resolutions and data graphs live under the default package directory of the project (for example `force-app/main/default/data360/...`). The plugin reads `sfdx-project.json` to find it. `INVALID_PROJECT` means `packageDirectories` is missing or empty, more than one entry is marked `default` (or none is, with several entries), or the chosen `path` is absolute, empty or leads outside the project.

When there is no `sfdx-project.json` at all, the plugin uses `force-app`.

## Why the plugin stops

Writing or reading files in a folder the project does not clearly define could put files where Salesforce CLI tools do not look, or outside the project.

## How to fix

1. Open `sfdx-project.json` in the project root (`--output-dir` for retrieve).
2. Make sure `packageDirectories` has exactly one entry with `"default": true`, or exactly one entry.
3. Use a relative `path` such as `force-app`, without `..`.
4. Rerun the command.

## Example output

```text
Retrieve: blocked.
segment:High_Value_Customers: INVALID_PROJECT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: sfdx-project.json does not name one usable package directory. Give packageDirectories exactly one default entry with a relative path inside the project, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_PROJECT.md
Downloaded segment: 0
```

## Related codes

- [`UNSAFE_PATH`](../general/UNSAFE_PATH.md) — the output path itself is not safe to write to.
- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — writing the file failed.
