# `IDENTITY_RESOLUTION_DATASPACE_MISMATCH`

> The ruleset file's c__dataSpace, or the ruleset of that name in the org, is in another data space than the run. Rerun with the --dataspace the message names, or correct c__dataSpace.

|              |                                                                       |
| ------------ | --------------------------------------------------------------------- |
| **Family**   | Identity resolution                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`       |
| **Outcome**  | `blocked` before any write (deploy, delete); a failed item (retrieve) |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when it is left out. A ruleset file names its data space in `c__dataSpace`, and the ruleset in the org names it in `dataSpaceName`. This code means the file, or the ruleset of that name in the org, is in another data space than the run.

The ruleset route reads a ruleset of any data space by its name, so the plugin checks the data space of every read before it projects, keeps or changes anything.

## Why the plugin stops

A write or delete in the wrong data space would change a ruleset the run does not cover, and a retrieved file would carry the wrong data space. The plugin refuses before any write, delete or file is written, and never keeps such a ruleset as a verbatim file.

## How to fix

1. Run the command with the `--dataspace` the message names.
2. Or correct `c__dataSpace` in the file. Outside `default` the ruleset and its references carry the names Salesforce stores there (`ds2_Individual_cx2a`, `ds2_Individual__dlm`).

## Example output

```text
Deploy preview: blocked. Nothing was sent to the org.
Data space: dataspace2.
IDENTITY_RESOLUTION_DATASPACE_MISMATCH: The file of identity resolution ruleset Individual_ir01 names the data space "default" in c__dataSpace, but the run's data space is "dataspace2" (--dataspace, default "default"). Run the command with --dataspace "default", or correct the file. Nothing was written.
```

## Related codes

- [`IDENTITY_RESOLUTION_DATASPACE_UNREADABLE`](../identity-resolution/IDENTITY_RESOLUTION_DATASPACE_UNREADABLE.md) — the ruleset read names no usable data space.
- [`IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE`](../identity-resolution/IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE.md) — a DMO or DLO the ruleset names is in another data space.
- [`IDENTITY_RESOLUTION_NAME_NOT_STORED`](../identity-resolution/IDENTITY_RESOLUTION_NAME_NOT_STORED.md) — the ruleset name lacks the data space prefix.
