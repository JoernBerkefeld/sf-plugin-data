# `RELATIONSHIP_CHANGE_UNSUPPORTED`

> The relationship exists with a different cardinality or owner, and Salesforce cannot change it. Delete it with sf data360 delete -m relationship:SourceDmo__dlm:Name, then deploy the file again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Relationship                    |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A relationship with the binding of the file (same objects and fields) exists in the org, but its cardinality or owner differs from the file. The message names the existing relationship and both values.

## Why the plugin stops

Salesforce offers no request to change a relationship, and the plugin never deletes a relationship as part of a deploy.

## How to fix

1. Decide whether the org or the file is right.
2. To apply the file, delete the existing relationship with `sf data360 delete -m relationship:<SourceDmo__dlm>:<Name>` (the source DMO and name in the message), then deploy the file again.
3. To keep the org, retrieve the source DMO's relationships with `--overwrite` instead.

## Example output

```text
Deploy preview: blocked (RELATIONSHIP_CHANGE_UNSUPPORTED). No deployment executed.
RELATIONSHIP_CHANGE_UNSUPPORTED: The relationship Order_CustomerId_map_Customer_Id_1794467679481 with this binding exists with cardinality ManyToOne and owner DataCloud; the file asks for OneToOne and DataCloud. Salesforce has no route to change a relationship: delete it (sf data360 delete --metadata relationship:Order__dlm:Order_CustomerId_map_Customer_Id_1794467679481) and deploy the file again. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The relationship exists with a different cardinality or owner, and Salesforce cannot change it. Delete it with sf data360 delete -m relationship:SourceDmo__dlm:Name, then deploy the file again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_CHANGE_UNSUPPORTED.md
```

## Related codes

- [`AMBIGUOUS_RELATIONSHIP_TARGET`](../relationship/AMBIGUOUS_RELATIONSHIP_TARGET.md) — Several relationships carry the same binding.
