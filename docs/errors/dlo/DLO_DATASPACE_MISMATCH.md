# `DLO_DATASPACE_MISMATCH`

> The DLO file, --dataspace and the org disagree on the data space. Make identity.dataSpace in the file match --dataspace and the target DLO, then rerun.

|              |                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                                                          |
| **Commands** | `sf data360 deploy`                                                                                                       |
| **Outcome**  | `blocked` — nothing was changed (or `failed` with mutation `unknown` when the answer to a write names another data space) |

## What it means

A DLO deploy compares three data space values: `identity.dataSpace` in the `.dlo-meta.json` file, the `--dataspace` flag when you pass it, and the data space of the DLO that already exists in the org. This code means two of them differ.

It can also come after a create or update, when the DLO Salesforce returns is in a different data space than the file asked for.

## Why the plugin stops

A DLO belongs to a data space, and the same name can exist in more than one. Writing a definition across data spaces would change an object the file was never meant for. The plugin stops before the write so nothing is changed in the wrong place.

## How to fix

1. Open the file and check `identity.dataSpace`.
2. If you pass `--dataspace`, use the same value, or leave the flag out.
3. Check which data space holds the DLO in the target org. If it is a different one, either correct the file or deploy into the matching data space.
4. If the code came after a write (mutation `unknown`), read the DLO in the org before deploying again.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dlo:Orders__dll; mutation: not-attempted.
DLO_DATASPACE_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Target lookup or definition admission failed; no write attempted.
Hint: The DLO file, --dataspace and the org disagree on the data space. Make identity.dataSpace in the file match --dataspace and the target DLO, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DLO_DATASPACE`](../dlo/UNSUPPORTED_DLO_DATASPACE.md) — the org copy itself has no single usable data space.
- [`DLO_DATASPACE_COLLISION`](../dlo/DLO_DATASPACE_COLLISION.md) — the same disagreement between a local file and a retrieve.
- [`DMO_DATASPACE_MISMATCH`](../dmo/DMO_DATASPACE_MISMATCH.md) — the same check for data model objects.
