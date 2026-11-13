# `MAPPING_PERSISTENCE_UNCONFIRMED`

> The mapping write was sent, but reading it back did not show the expected pairs. Inspect the mapping in the org before deploying again; nothing was retried or rolled back.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Mapping                       |
| **Commands** | `sf data360 deploy`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

After creating or updating the mapping, the plugin reads it back up to six times. The reads never showed exactly the pairs of your file with the existing pairs preserved, or the pairs changed between reads.

## Why the plugin stops

Only a matching read confirms the deploy. Sending the write again could add pairs twice or undo a change Salesforce is still processing.

## How to fix

1. Wait a few minutes, then retrieve the mapping: `sf data360 retrieve --metadata mapping:<Name>`.
2. Compare it with your file.
3. Run the deploy again with `--preview` to see what is still different.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: mapping:Customer_Home_map; mutation: unknown.
MAPPING_PERSISTENCE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The mapping write was sent, but reading it back did not show the expected pairs. Inspect the mapping in the org before deploying again; nothing was retried or rolled back.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_PERSISTENCE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`MAPPING_TARGET_NOT_SETTLED`](../mapping/MAPPING_TARGET_NOT_SETTLED.md) — a mapping is not ACTIVE yet.
- [`MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED`](../mapping/MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED.md) — a pair removal could not be confirmed by reading back.
