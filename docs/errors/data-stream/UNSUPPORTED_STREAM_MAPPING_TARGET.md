# `UNSUPPORTED_STREAM_MAPPING_TARGET`

> A targetFieldName in spec.additiveFieldMappings is a source field name or a reserved system name such as DataSource or KQ_. Choose a new, ordinary field name.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                  |
| **Commands** | `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` — nothing was changed                                              |

## What it means

A new mapping creates a new landing field. Its `targetFieldName` must not be:

- the name of an existing source field (those are mapped one to one already),
- `DataSource`, `DataSourceObject`, `cdp_sys_SourceVersion` or `InternalOrganization`, or
- a name starting with `KQ_`.

Case does not matter for these checks.

## Why the plugin stops

Those names are used by the stream itself or by Salesforce. Mapping onto them would change fields the stream depends on.

## How to fix

1. Pick a new name for the landing field, without `__c`.
2. Update `targetFieldName` in the stream file.
3. Run the deploy with `--preview`, then deploy.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
UNSUPPORTED_STREAM_MAPPING_TARGET: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: A targetFieldName in spec.additiveFieldMappings is a source field name or a reserved system name such as DataSource or KQ_. Choose a new, ordinary field name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_MAPPING_TARGET.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_STREAM_MAPPING_SOURCE`](../data-stream/UNSUPPORTED_STREAM_MAPPING_SOURCE.md) — the source side of the same mapping.
- [`STREAM_MAPPING_CONFLICT`](../data-stream/STREAM_MAPPING_CONFLICT.md) — the target exists with a different mapping.
