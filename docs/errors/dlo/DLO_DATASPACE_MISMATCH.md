# `DLO_DATASPACE_MISMATCH`

> The c__dataSpace list of the DLO file does not hold the data space of the run. Add it to the list, or run with the --dataspace the file lists.

|              |                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                                                          |
| **Commands** | `sf data360 deploy`                                                                                                       |
| **Outcome**  | `blocked` — nothing was changed (or `failed` with mutation `unknown` when the answer to a write names another data space) |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when you leave it out. A DLO file lists every data space the DLO belongs to in its top-level `c__dataSpace` key. A deploy of the file must run in one of them; this code means the run's data space is not in the list.

It can also come after a create or update, when the DLO Salesforce returns is not in the run's data space.

## Why the plugin stops

The plugin never filters a selected file out silently. A file that names other data spaces than the run's is refused, so a deploy never changes a DLO in a data space you did not ask for.

## How to fix

1. Open the file and check `c__dataSpace`.
2. Run the deploy with `--dataspace` set to one of the listed data spaces, or add the run's data space to the list (the deploy then adds the DLO to it).
3. If the code came after a write (mutation `unknown`), read the DLO in the org before deploying again.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dlo:Orders__dll; mutation: not-attempted.
DLO_DATASPACE_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The file lists the data spaces dataspace2 in c__dataSpace, not the run's data space default (--dataspace, default "default").
Hint: The c__dataSpace list of the DLO file does not hold the data space of the run. Add it to the list, or run with the --dataspace the file lists.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DLO_DATASPACE`](../dlo/UNSUPPORTED_DLO_DATASPACE.md) — the org copy is not in the run's data space.
- [`DLO_DATASPACE_REMOVAL_NOT_ALLOWED`](../dlo/DLO_DATASPACE_REMOVAL_NOT_ALLOWED.md) — the org lists data spaces the file leaves out.
- [`DMO_DATASPACE_MISMATCH`](../dmo/DMO_DATASPACE_MISMATCH.md) — the same check for data model objects.
