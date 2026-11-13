# `MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED`

> A field pair was removed, but reading the mappings back did not confirm the expected result. Inspect the DMO's mappings in the org before trying again; nothing was rolled back.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Mapping                                          |
| **Commands** | `sf data360 deploy`, `sf data360 delete --field` |
| **Outcome**  | `failed` — mutation `unknown`                    |

## What it means

After removing a pair (during a mapping update), or after removing DMO fields together with their pairs, the plugin reads all mappings of the DMO again. The reads never showed exactly the planned pairs gone with everything else unchanged, or a mapping was in an unexpected state.

## Why the plugin stops

Only a matching read confirms the removal. Going on with further writes on an unconfirmed state could remove the wrong pairs.

## How to fix

1. Read the difference named in the message, if any.
2. Wait a few minutes, then retrieve the DMO's mappings.
3. Compare them with your files and rerun with `--preview`.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: mapping:Customer_Home_map; mutation: unknown.
MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: A field pair was removed, but reading the mappings back did not confirm the expected result. Inspect the DMO's mappings in the org before trying again; nothing was rolled back.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`MAPPING_PERSISTENCE_UNCONFIRMED`](../mapping/MAPPING_PERSISTENCE_UNCONFIRMED.md) — a mapping write could not be confirmed by reading it back.
- [`MAPPING_PARENT_CHANGED`](../mapping/MAPPING_PARENT_CHANGED.md) — the DLO or DMO changed while pairs were being removed.
