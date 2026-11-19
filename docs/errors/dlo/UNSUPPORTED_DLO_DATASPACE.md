# `UNSUPPORTED_DLO_DATASPACE`

> The DLO in the org lists no usable data space, or not the data space of the run. Pass a --dataspace the DLO belongs to (its c__dataSpace list) and rerun.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data lake object                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                    |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update |

## What it means

Each DLO read from the org lists the data spaces it belongs to (`dataSpaceInfo`). A retrieve or delete runs in one data space (`--dataspace`, `default` when left out), and the DLO must belong to it. The answer listed no data space, an empty name, or not the run's data space.

A retrieve writes every data space of the DLO into the `c__dataSpace` list of its file; the run's data space only selects which DLOs are read.

## Why the plugin stops

A DLO outside the run's data space is not the one you asked for. Reading or deleting it there would act on a data space the command was not run in.

## How to fix

1. Check in the org which data spaces hold the DLO (or the `c__dataSpace` list of its file).
2. Rerun with `--dataspace <name>` set to one of them.
3. If the code came after a write (mutation `unknown`), read the DLO in the org before you deploy again.

## Example output

```text
Retrieve: failed.
dlo:Orders__dll: UNSUPPORTED_DLO_DATASPACE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The DLO in the org lists no usable data space, or not the data space of the run. Pass a --dataspace the DLO belongs to (its c__dataSpace list) and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_DATASPACE.md
Downloaded dlo: 0
```

## Related codes

- [`DLO_DATASPACE_MISMATCH`](../dlo/DLO_DATASPACE_MISMATCH.md) — the file does not list the run's data space.
- [`DLO_DELETE_OTHER_DATASPACES`](../dlo/DLO_DELETE_OTHER_DATASPACES.md) — the DLO also belongs to other data spaces.
- [`UNSUPPORTED_DMO_DATASPACE`](../dmo/UNSUPPORTED_DMO_DATASPACE.md) — the same check for data model objects.
