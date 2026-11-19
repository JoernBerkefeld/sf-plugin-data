# `DMO_DATASPACE_MISMATCH`

> The DMO file's c__dataSpace is not the data space of the run, or the DMO in the org is in another one. Run with the --dataspace the file names, or correct c__dataSpace, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data model object               |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when you leave it out. A DMO file names its data space in its top-level `c__dataSpace` key. This code means the file names another data space than the run's, or the DMO that already exists in the org is in another one.

## Why the plugin stops

The plugin never filters a selected file out silently. A file of another data space is refused, so a deploy never changes a DMO in a data space you did not ask for.

## How to fix

1. Check `c__dataSpace` in the file.
2. Pass `--dataspace` with the same value, or leave it out when the file says `default`.
3. Deploy files of different data spaces in separate runs.
4. Rerun the deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:Customer__dlm; mutation: not-attempted.
DMO_DATASPACE_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The DMO file's c__dataSpace is not the data space of the run, or the DMO in the org is in another one. Run with the --dataspace the file names, or correct c__dataSpace, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DMO_DATASPACE`](../dmo/UNSUPPORTED_DMO_DATASPACE.md) — the org copy is not in the requested data space.
- [`DLO_DATASPACE_MISMATCH`](../dlo/DLO_DATASPACE_MISMATCH.md) — the same check for data lake objects.
