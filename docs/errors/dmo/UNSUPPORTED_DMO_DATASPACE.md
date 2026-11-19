# `UNSUPPORTED_DMO_DATASPACE`

> The DMO in the org is not in the data space of the run. Pass the --dataspace that holds the DMO (its c__dataSpace), or leave the flag out for default, and rerun.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data model object                                                                                                  |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                    |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update |

## What it means

Every command runs in one data space (`--dataspace`, or `default`). A DMO read from the org must report exactly that data space in `dataSpaceName`. It reported another one. Names are unique in the org, so a DMO of another data space cannot be read under this one.

## Why the plugin stops

Every file and every write is bound to one data space. A DMO from another data space must not be saved or changed under the wrong one, so the plugin stops.

## How to fix

1. Check in the org which data space holds the DMO.
2. Pass that value with `--dataspace`, or correct `c__dataSpace` in the file.
3. If the code came after a write (mutation `unknown`), read the DMO in the org before you deploy again.

## Example output

```text
Retrieve: failed.
dmo:Customer__dlm: UNSUPPORTED_DMO_DATASPACE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The DMO in the org is not in the data space of the run. Pass the --dataspace that holds the DMO (its c__dataSpace), or leave the flag out for default, and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/UNSUPPORTED_DMO_DATASPACE.md
Downloaded dmo: 0
```

## Related codes

- [`DMO_DATASPACE_MISMATCH`](../dmo/DMO_DATASPACE_MISMATCH.md) — the file, the flag and the org disagree on deploy.
- [`UNSUPPORTED_DLO_DATASPACE`](../dlo/UNSUPPORTED_DLO_DATASPACE.md) — the same check for data lake objects.
