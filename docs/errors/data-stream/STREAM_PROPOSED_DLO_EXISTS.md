# `STREAM_PROPOSED_DLO_EXISTS`

> A DLO with the name in spec.newDlo.name exists. Choose another name, or delete the old DLO first if it is no longer needed.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

Before creating a stream, the plugin checks that no DLO exists with the name in `spec.newDlo.name`. Only a clear "not found" answer counts as absent. This code means a DLO with that name was found.

## Why the plugin stops

A stream needs its own new landing DLO; an existing DLO with that name would clash.

## How to fix

1. Set `spec.newDlo.name` to an unused name ending in `__dll`, or delete the old DLO first (`sf data360 delete -m dlo:<Name>__dll`) if it is no longer needed.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order; mutation: not-attempted.
STREAM_PROPOSED_DLO_EXISTS: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A DLO with the name in spec.newDlo.name exists. Choose another name, or delete the old DLO first if it is no longer needed.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_PROPOSED_DLO_EXISTS.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_EXISTING_BINDING_REQUIRES_UPDATE`](../data-stream/STREAM_EXISTING_BINDING_REQUIRES_UPDATE.md) — a stream already exists on the connection.
- [`STREAM_DELETE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_DELETE_SETTLEMENT_UNCONFIRMED.md) — a stream delete (with `--delete-dlo`, also its DLO) was not confirmed.
