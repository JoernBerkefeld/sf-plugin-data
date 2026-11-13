# `DMO_DATASPACE_MISMATCH`

> The DMO file, --dataspace and the org disagree on the data space. Make identity.dataSpace in the file match --dataspace and the target DMO, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data model object               |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A DMO deploy compares the data space in three places: `identity.dataSpace` in the `.dmo-meta.json` file, the `--dataspace` flag when you pass it, and the data space of the DMO that already exists in the org. Two of them differ.

It also fires when the DMO does not exist yet, the file names a data space other than `default`, and `--dataspace` is not passed: a new DMO outside the default data space needs the flag.

## Why the plugin stops

The same DMO name can exist in more than one data space. Writing across data spaces would change an object the file was not meant for, so the plugin stops before any write.

## How to fix

1. Check `identity.dataSpace` in the file.
2. Pass `--dataspace` with the same value, or leave it out when the file says `default`.
3. Check which data space holds the DMO in the target org and correct the file or the flag to match.
4. Rerun the deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:Customer__dlm; mutation: not-attempted.
DMO_DATASPACE_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The DMO file, --dataspace and the org disagree on the data space. Make identity.dataSpace in the file match --dataspace and the target DMO, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DMO_DATASPACE`](../dmo/UNSUPPORTED_DMO_DATASPACE.md) — the org copy is not in the requested data space.
- [`DLO_DATASPACE_MISMATCH`](../dlo/DLO_DATASPACE_MISMATCH.md) — the same check for data lake objects.
