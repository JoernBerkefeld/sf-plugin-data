# `RELATIONSHIP_UPDATE_REJECTED`

> Salesforce refused the Metadata API update of the relationship, and nothing was changed. Read Salesforce's answer in the message; a changed owner or target object is refused, for example.

|              |                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------- |
| **Family**   | Relationship                                                                                       |
| **Commands** | `sf data360 deploy`                                                                                |
| **Outcome**  | `failed` — mutation `rejected` (nothing written); `unknown` when it follows the create of the item |

## What it means

The relationship file differs from the org relationship it names (or whose binding it carries), so deploy sent one Metadata API `updateMetadata` of the whole `FieldSrcTrgtRelationship` record with the file's values. Salesforce answered with an error (success `false`, or a client SOAP fault such as `soapenv:Client`, `sf:INVALID_…` or `sf:REQUEST_LIMIT_EXCEEDED`). The message shows its status code and, when it can be shown, its text. A server fault (`soapenv:Server`, `sf:UNKNOWN_EXCEPTION`) or another SOAP fault is not a refusal: the update may have been applied, so it is reported as [`RELATIONSHIP_REQUEST_UNCONFIRMED`](../relationship/RELATIONSHIP_REQUEST_UNCONFIRMED.md) and not sent again.

Observed at API 68 on an active relationship between mapped custom DMOs: a changed label, cardinality (`ManyToOne` to `OneToOne`), source field or target field is accepted; a changed target object or owner is refused with `UNKNOWN_EXCEPTION` ("An unexpected error occurred"), and an unknown cardinality value with a SOAP fault naming the value.

Salesforce also answers a valid change with `UNKNOWN_EXCEPTION` now and then, and accepts it when it is sent again. So when the answer is that unexpected error, deploy reads the relationship again and, if the org still holds it unchanged, sends the same update once more. It never sends it a third time and never resends after any other error. When that second update ends in a server fault, the outcome is [`RELATIONSHIP_REQUEST_UNCONFIRMED`](../relationship/RELATIONSHIP_REQUEST_UNCONFIRMED.md) with mutation `unknown`. When both answers are refusals, nothing was changed and the mutation is `rejected`; when the re-read shows the relationship changed, deploy stops with [`RELATIONSHIP_PERSISTENCE_UNCONFIRMED`](../relationship/RELATIONSHIP_PERSISTENCE_UNCONFIRMED.md).

A file with a label that is created first gets its label set by an update right after the create. If Salesforce refuses that update, the relationship exists without the label and the mutation is `unknown`.

## Why the plugin stops

The plugin sends the file as written and Salesforce decides; apart from the one resend after an unexpected error, it does not retry, and it never deletes the relationship.

## How to fix

1. Read Salesforce's answer in the message.
2. To change the target object or owner, delete the relationship with `sf data360 delete -m relationship:<SourceDmo__dlm>:<Name>`, then deploy the file again.
3. To keep the org, retrieve the source DMO's relationships with `--overwrite` instead.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: relationship:Order_CustomerId_map_Customer_Id_1794467679481; mutation: rejected.
RELATIONSHIP_UPDATE_REJECTED: Salesforce refused the Metadata API update of the relationship Order_CustomerId_map_Customer_Id_1794467679481: UNKNOWN_EXCEPTION. Nothing was changed. Salesforce rejected the write and nothing was written for this item; correct the input before another attempt.
Hint: Salesforce refused the Metadata API update of the relationship, and nothing was changed. Read Salesforce's answer in the message; a changed owner or target object is refused, for example.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_UPDATE_REJECTED.md
```

## Related codes

- [`RELATIONSHIP_PERSISTENCE_UNCONFIRMED`](../relationship/RELATIONSHIP_PERSISTENCE_UNCONFIRMED.md) — The update was accepted but did not read back in time.
- [`AMBIGUOUS_RELATIONSHIP_TARGET`](../relationship/AMBIGUOUS_RELATIONSHIP_TARGET.md) — Several relationships carry the same binding.
