# `UNSUPPORTED_DLO_DATASPACE`

> The DLO in the org is not in exactly one data space, or not in the one requested. Pass the --dataspace that holds the DLO and rerun.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data lake object                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                    |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update |

## What it means

Each DLO read from the org lists the data spaces it belongs to. The plugin needs one of these:

- without `--dataspace`: the DLO must belong to exactly one data space;
- with `--dataspace`: the DLO must belong to that data space.

The answer listed no data space, an empty name, several data spaces with no flag to choose, or not the one you asked for.

## Why the plugin stops

Every local file records one data space, and every write is bound to it. If the plugin cannot tell which data space the DLO is in, it cannot save or change it without risking the wrong one.

## How to fix

1. Check in the org which data space(s) hold the DLO.
2. If it is in several, rerun with `--dataspace <name>` where the command supports it.
3. If it is not in the data space you passed, correct the flag.
4. If the code came after a write (mutation `unknown`), read the DLO in the org before you deploy again.

## Example output

```text
Retrieve: failed.
dlo:Orders__dll: UNSUPPORTED_DLO_DATASPACE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The DLO in the org is not in exactly one data space, or not in the one requested. Pass the --dataspace that holds the DLO and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_DATASPACE.md
Downloaded dlo: 0
```

## Related codes

- [`DLO_DATASPACE_MISMATCH`](../dlo/DLO_DATASPACE_MISMATCH.md) — the file and the org disagree on the data space.
- [`UNSUPPORTED_DMO_DATASPACE`](../dmo/UNSUPPORTED_DMO_DATASPACE.md) — the same check for data model objects.
