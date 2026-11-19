# `UNKNOWN_DATASPACE`

> The org has no data space of that name. Check --dataspace and the c__dataSpace values of the selected files against the data spaces the message lists.

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| **Family**   | General                                                             |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`     |
| **Outcome**  | `blocked` — nothing was read from, written to or deleted in the org |

## What it means

Each command reads the org's data spaces once (`GET /ssot/data-spaces`) before anything else. The run's data space (`--dataspace`, `default` when left out) or a data space a selected file names in `c__dataSpace` is not one of them. The message lists the names the org has.

## Why the plugin stops

A data space that does not exist cannot hold the component. Some routes would ignore an unknown name and act on another data space, so the plugin checks first.

## How to fix

1. Compare the name in the message with the data spaces it lists; names are case-sensitive.
2. Correct `--dataspace`, or the `c__dataSpace` value of the file.
3. If the data space should exist, create it in Data Cloud Setup first.

## Example output

```text
Deploy preview: blocked (UNKNOWN_DATASPACE). No deployment executed.
UNKNOWN_DATASPACE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The org has no data space named dataspace3; its data spaces are dataspace2, default.
Hint: The org has no data space of that name. Check --dataspace and the c__dataSpace values of the selected files against the data spaces the message lists.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/UNKNOWN_DATASPACE.md
```

## Related codes

- [`DATASPACE_READ_FAILED`](../general/DATASPACE_READ_FAILED.md) — the list of data spaces could not be read.
- [`INVALID_DATASPACE_FIELD`](../general/INVALID_DATASPACE_FIELD.md) — the file value is not a usable name.
