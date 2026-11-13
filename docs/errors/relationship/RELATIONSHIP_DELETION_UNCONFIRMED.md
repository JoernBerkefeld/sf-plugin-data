# `RELATIONSHIP_DELETION_UNCONFIRMED`

> The relationship delete was sent, but the relationship still appears in the source DMO's list. Check it in the org before deleting again; nothing is retried.

|              |                                                                           |
| ------------ | ------------------------------------------------------------------------- |
| **Family**   | Relationship                                                              |
| **Commands** | `sf data360 delete`                                                       |
| **Outcome**  | `failed` — mutation `unknown`: the relationship may or may not be deleted |

## What it means

The plugin sent one delete request and then read the source DMO's relationship list several times. The relationship was still listed after the last read.

## Why the plugin stops

Salesforce may need longer, or the delete may not have taken effect. The plugin does not send the delete again.

## How to fix

1. Wait a moment, then preview the delete: `sf data360 delete -m relationship:<Name> --preview`. `unchanged` means it is gone.
2. If it is still present, run the delete again.

## Example output

```text
Delete: failed.
Failed: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: unknown.
RELATIONSHIP_DELETION_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The relationship delete was sent, but the relationship still appears in the source DMO's list. Check it in the org before deleting again; nothing is retried.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_DELETION_UNCONFIRMED.md
```

## Related codes

- [`RELATIONSHIP_REQUEST_UNCONFIRMED`](../relationship/RELATIONSHIP_REQUEST_UNCONFIRMED.md) — The delete request itself ended unclearly.
- [`RELATIONSHIP_HTTP_ERROR`](../relationship/RELATIONSHIP_HTTP_ERROR.md) — Salesforce rejected the delete.
