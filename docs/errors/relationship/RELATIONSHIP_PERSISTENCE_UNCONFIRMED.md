# `RELATIONSHIP_PERSISTENCE_UNCONFIRMED`

> The relationship create was sent, but it did not read back as active with the requested settings in time. Check the source DMO's relationships before deploying again.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | Relationship                                                               |
| **Commands** | `sf data360 deploy`                                                        |
| **Outcome**  | `failed` — mutation `unknown`: the change may or may not have been applied |

## What it means

After the create, the plugin reads the source DMO's relationship list until the relationship is `ACTIVE` with the requested cardinality and owner. It did not get there within the read budget, or it showed a status other than `ACTIVE` or `CREATING`, which ends the reads at once. The message names that status when there is one.

## Why the plugin stops

The create was sent, but its result is not confirmed. The plugin does not send it again.

## How to fix

1. Wait a moment, then run `sf data360 deploy -m relationship:<Name> --preview`: `unchanged` means it is in place.
2. If the relationship shows another status, check it in the org; delete it and deploy again if needed.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: unknown.
RELATIONSHIP_PERSISTENCE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Write outcome is unknown; list the source DMO relationships before another attempt. No automatic retry.
Hint: The relationship create was sent, but it did not read back as active with the requested settings in time. Check the source DMO's relationships before deploying again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_PERSISTENCE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`RELATIONSHIP_REQUEST_UNCONFIRMED`](../relationship/RELATIONSHIP_REQUEST_UNCONFIRMED.md) — The create request itself ended unclearly.
