# `DMO_FIELD_REMOVAL_MAPPED`

> A field to remove is still mapped. Drop its pair from the mapping first, or select every mapping holding it in the same deploy with that pair removed from each file.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data model object                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

Salesforce removes a mapped DMO field without objection and drops its mapping pairs with it. The plugin therefore only removes a mapped field when that is clearly intended:

- **Deploy with `--allow-field-removal`**: the field is missing from the DMO file, but it is mapped, and the same deploy does not select every mapping that holds a pair for it with that pair dropped from the mapping file.
- **`delete --field`**: the field is mapped, but no mapping that targets this DMO lists a pair for it, so the pair cannot be identified.

The message names the fields and, where known, the mappings that hold them.

## Why the plugin stops

Removing the field would silently change mappings you did not select. The plugin checks this before the first write of the command, so nothing is changed.

## How to fix

For a deploy, choose one:

1. Remove the pair from the mapping file and select that mapping in the same deploy (`-m mapping:<Name>`), for every mapping that holds the field; or
2. Deploy the mapping without the pair first, then deploy the DMO.

For `delete --field`, read the mappings of the DMO in the org; a field marked mapped without a visible pair needs the mapping fixed in Data Cloud setup first.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:Customer__dlm; mutation: not-attempted.
DMO_FIELD_REMOVAL_MAPPED: Field removal refused for Customer__dlm: Nickname__c is mapped by Customer_Map. Salesforce would drop the mapping pair(s) together with the field(s), so remove the pair(s) from the mapping file(s) and deploy the mapping(s) and the DMO in one command:
sf data360 retrieve -o my-org -m mapping:Customer_Map -m dmo:Customer__dlm --overwrite
In data360/mapping/Customer_Map.mapping-meta.json remove the pair(s) whose targetFieldDeveloperName is Nickname__c; keep all other pairs. In data360/dmo/Customer__dlm.dmo-meta.json remove the field(s) Nickname__c.
sf data360 deploy -o my-org -m mapping:Customer_Map -m dmo:Customer__dlm --allow-field-removal
No write attempted; correct the reported check before another attempt.
Hint: A field to remove is still mapped. Drop its pair from the mapping first, or select every mapping holding it in the same deploy with that pair removed from each file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_REMOVAL_MAPPED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`DMO_FIELD_REMOVAL_PLANNED`](../dmo/DMO_FIELD_REMOVAL_PLANNED.md) — the preview notice listing the fields that will be removed.
- [`DMO_FIELD_REMOVAL_SIDE_EFFECT`](../dmo/DMO_FIELD_REMOVAL_SIDE_EFFECT.md) — more than the planned pairs changed.
- [`MAPPING_PROTECTED_PAIR_REQUIRED`](../mapping/MAPPING_PROTECTED_PAIR_REQUIRED.md) — a mapping file drops a pair that is never removed.
