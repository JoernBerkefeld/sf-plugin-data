# `DLO_DATASPACE_NOT_SETTLED`

> The DLO data space change was sent, but the DLO did not list the planned data spaces in time. Read the DLO in the org before you deploy again.

|              |                                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                 |
| **Commands** | `sf data360 deploy`                                                              |
| **Outcome**  | `failed` with mutation `unknown` — the change was sent and may still take effect |

## What it means

The deploy added the DLO to a data space or removed it from one, then read the DLO again until its `dataSpaceInfo` listed exactly the data spaces of the file. Salesforce answers such a change with `PROCESSING` and usually settles within seconds; here the DLO still listed other data spaces after the last read. The message names both lists.

## Why the plugin stops

Later items may depend on the DLO being in a data space (a mapping there, for example). The plugin does not continue on a change it could not confirm.

## How to fix

1. Wait a minute, then read the DLO with `sf data360 deploy --preview` or `sf data360 retrieve`.
2. If it lists the data spaces of the file, rerun the deploy; it reports the DLO unchanged.
3. If not, check the data space in Data Cloud Setup before you deploy again.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: unknown.
DLO_DATASPACE_NOT_SETTLED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Orders__dll still lists the data spaces default instead of dataspace2, default. Read the DLO in the org before deploying again.
Hint: The DLO data space change was sent, but the DLO did not list the planned data spaces in time. Read the DLO in the org before you deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_NOT_SETTLED.md
```

## Related codes

- [`DLO_DATASPACE_REMOVAL_NOT_ALLOWED`](../dlo/DLO_DATASPACE_REMOVAL_NOT_ALLOWED.md) — a removal needs --allow-dataspace-removal.
