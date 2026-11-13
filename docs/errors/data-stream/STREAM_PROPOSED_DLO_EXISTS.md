# `STREAM_PROPOSED_DLO_EXISTS`

> A DLO with the name in spec.newDlo.name exists. For a create, choose another name; after a delete with --delete-dlo, check the DLO in the org.

|              |                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                       |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy — nothing was changed; `failed` with mutation `unknown` on delete             |

## What it means

On deploy, before creating a stream, the plugin checks that no DLO exists with the name in `spec.newDlo.name`. Only a clear "not found" answer counts as absent. This code means a DLO with that name was found.

On delete with `--delete-dlo`, the plugin uses the same check after the delete to confirm the linked DLO is gone. Here the code means the DLO was still found by name or ID.

## Why the plugin stops

On create, a stream needs its own new landing DLO; an existing DLO with that name would clash. On delete, the plugin cannot report success while the DLO it was asked to delete still exists.

## How to fix

1. For a create, set `spec.newDlo.name` to an unused name ending in `__dll`, or delete the old DLO first if it is no longer needed.
2. After a delete, check the DLO in Data Cloud Setup. It may still be being deleted; if it stays, delete it with `sf data360 delete -m dlo:<Name>__dll`.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order; mutation: not-attempted.
STREAM_PROPOSED_DLO_EXISTS: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A DLO with the name in spec.newDlo.name exists. For a create, choose another name; after a delete with --delete-dlo, check the DLO in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_PROPOSED_DLO_EXISTS.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_EXISTING_BINDING_REQUIRES_UPDATE`](../data-stream/STREAM_EXISTING_BINDING_REQUIRES_UPDATE.md) — a stream already exists on the connection.
- [`STREAM_DELETE_SETTLEMENT_UNCONFIRMED`](../data-stream/STREAM_DELETE_SETTLEMENT_UNCONFIRMED.md) — the stream delete itself was not confirmed.
