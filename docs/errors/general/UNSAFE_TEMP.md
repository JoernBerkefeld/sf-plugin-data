# `UNSAFE_TEMP`

> On Windows, TEMP, TMP, TMPDIR or the Node.js temp folder is not the temp folder the plugin accepts. Set them to the same absolute folder for this shell, then rerun.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | General                                                                                                            |
| **Commands** | `sf data360 retrieve` (Segments, calculated insights); other file writes report `OUTPUT_FAILED` for the same cause |
| **Outcome**  | `blocked` — no file was written; the org was not changed                                                           |

## What it means

Before the plugin creates a private temporary folder (to stage a file or to run the Salesforce CLI retrieve), it checks the temp folder settings on Windows. `TEMP` and the Node.js temp folder must be set, and `TMP` and `TMPDIR` must match when set. All of them must be absolute and point to the one temp folder the plugin accepts. In this version that folder is fixed to `F:\Temp`.

On macOS and Linux the check is skipped.

## Why the plugin stops

Temporary files may briefly hold retrieved definitions. Checking the location first keeps them out of shared or unexpected folders, such as a drive root.

## How to fix

1. Run `echo $env:TEMP $env:TMP $env:TMPDIR` in PowerShell to see the current values.
2. Set them for the current shell to the accepted folder, for example `$env:TEMP='F:\Temp'; $env:TMP='F:\Temp'`, and clear `TMPDIR` if it points elsewhere.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
segment:High_Value_Customers: UNSAFE_TEMP: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: On Windows, TEMP, TMP, TMPDIR or the Node.js temp folder is not the temp folder the plugin accepts. Set them to the same absolute folder for this shell, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/UNSAFE_TEMP.md
Downloaded segment: 0
```

## Related codes

- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — how most writers report the same temp folder problem.
- [`UNSAFE_PATH`](../general/UNSAFE_PATH.md) — the output path itself was refused.
