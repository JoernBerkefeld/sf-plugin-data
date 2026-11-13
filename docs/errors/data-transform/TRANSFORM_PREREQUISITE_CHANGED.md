# `TRANSFORM_PREREQUISITE_CHANGED`

> The transform was written, but the source or output DLO changed during the deploy. Check both DLOs and the transform in Data Cloud before deploying again.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Family**   | Data transform                                               |
| **Commands** | `sf data360 deploy`                                          |
| **Outcome**  | `failed` — the transform write was sent; `mutation: unknown` |

## What it means

After the transform was created or updated and read back, the plugin read the source and output DLOs again. Their definitions, IDs or data space memberships no longer match what was checked right before the write.

## Why the plugin stops

The deploy only counts as successful when the DLOs it depends on stayed the same throughout. A change in between means the plugin cannot say whether the transform still fits them.

## How to fix

1. Open both DLOs in Data Cloud and find out what changed and who changed it.
2. Check that the transform is present and still matches your file.
3. Rerun the deploy once the DLOs are stable; an unchanged transform is then reported as `unchanged`.

## Example output

```text
Deploy execution: failed (TRANSFORM_PREREQUISITE_CHANGED). No automatic retry or rollback performed.
Failed: data-transform:Orders_Copy; mutation: unknown.
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
TRANSFORM_PREREQUISITE_CHANGED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The transform was written, but the source or output DLO changed during the deploy. Check both DLOs and the transform in Data Cloud before deploying again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_PREREQUISITE_CHANGED.md
```

## Related codes

- [`TRANSFORM_PREREQUISITE_DRIFT`](../data-transform/TRANSFORM_PREREQUISITE_DRIFT.md) — the same check, failing before the write was sent.
