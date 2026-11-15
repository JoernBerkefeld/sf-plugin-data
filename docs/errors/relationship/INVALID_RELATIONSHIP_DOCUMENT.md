# `INVALID_RELATIONSHIP_DOCUMENT`

> A relationship does not fit the file format: the source must be a DMO API name with a custom field (__c), the target any object and field API name (a DMO or a CRM object), and cardinality and owner must be set. Check it in the org.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Relationship                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`                      |
| **Outcome**  | `failed` on retrieve, `blocked` on deploy — nothing was changed |

## What it means

A relationship file holds a name, a data space and six values: source DMO and field, target object and field, cardinality and owner. The source DMO name must end in `__dlm` and the source field in `__c`; the target object and field are any API names, a DMO (`__dlm`, `__c`) or a CRM object such as `Account` and `Id` with owner `SObject`. Cardinality and owner must be plain, non-empty text.

A relationship read from the org, or one about to be sent, breaks these rules, for example because its source field is not a custom field.

## Why the plugin stops

The plugin writes and sends only relationships it can describe completely in its file format.

## How to fix

1. Check the relationship in the org: both objects, both fields, cardinality and owner.
2. Relationships whose source is not a DMO with a custom field cannot be handled by the plugin.

## Example output

```text
Retrieve: failed.
relationship:Order__dlm: INVALID_RELATIONSHIP_DOCUMENT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Relationship retrieval did not complete for this item; the org was not changed.
Hint: A relationship does not fit the file format: the source must be a DMO API name with a custom field (__c), the target any object and field API name (a DMO or a CRM object), and cardinality and owner must be set. Check it in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/INVALID_RELATIONSHIP_DOCUMENT.md
Downloaded relationship: 0
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — A local relationship file that is not valid.
- [`INVALID_RELATIONSHIP_RESPONSE`](../relationship/INVALID_RELATIONSHIP_RESPONSE.md) — The list answer itself is malformed.
