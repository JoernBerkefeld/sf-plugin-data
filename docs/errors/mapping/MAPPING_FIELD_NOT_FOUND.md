# `MAPPING_FIELD_NOT_FOUND`

> A field pair names a field that does not exist on the source DLO or the target DMO. Create the field first or correct the pair in the mapping file.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Every pair in `fieldMappings` must name an existing field on the source DLO and an existing field on the target DMO. The message names the pair and the missing field. The only exception is the key qualifier pair of a standard DMO that is not enabled yet, which Salesforce adds with the first mapping.

## Why the plugin stops

Salesforce would reject the pair, possibly after other pairs were already changed. Checking first keeps the mapping unchanged.

## How to fix

1. Check the field name for typos and the `__c` suffix.
2. If the field is new, add it to the DLO or DMO and deploy that first, or include it in the same deploy.
3. Otherwise remove the pair from the mapping file.

## Example output

```text
Deploy preview: blocked (MAPPING_FIELD_NOT_FOUND). No deployment executed.
MAPPING_FIELD_NOT_FOUND: The mapping pair Email__c -> Email_Address__c names the field Email_Address__c, which does not exist on Customer__dlm. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: A field pair names a field that does not exist on the source DLO or the target DMO. Create the field first or correct the pair in the mapping file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_FIELD_NOT_FOUND.md
```

## Related codes

- [`MAPPING_FIELD_TYPES_DIFFER`](../mapping/MAPPING_FIELD_TYPES_DIFFER.md) — notice for pairs whose field data types differ.
- [`MAPPING_DEPENDENCIES_PLANNED`](../mapping/MAPPING_DEPENDENCIES_PLANNED.md) — preview notice when the parents are created in the same deploy.
