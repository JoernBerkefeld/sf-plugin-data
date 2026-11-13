# `MAPPING_FIELD_TYPES_DIFFER`

> Some pairs map fields of different data types. Salesforce accepts this; check the listed pairs if the difference is not intended.

|              |                                     |
| ------------ | ----------------------------------- |
| **Family**   | Mapping                             |
| **Commands** | `sf data360 deploy --preview`       |
| **Outcome**  | informational — the preview goes on |

## What it means

At least one pair maps a source field onto a target field of another data type, for example Text onto Number. The message lists each such pair with both types.

## Why the plugin reports it

Salesforce accepts these pairs, but a type difference is often a mistake and can change how values are stored. The preview names them so you can decide.

## How to fix

Nothing is required. If a pair is not intended:

1. Correct the pair in the mapping file, or
2. Change the data type of one of the fields before deploying.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned update: mapping:Customer_Home_map.
Planned field add: Score__c -> Score__c.
MAPPING_FIELD_TYPES_DIFFER: These pairs map fields of different data types; Salesforce accepts them: Score__c (Text) -> Score__c (Number).
Hint: Some pairs map fields of different data types. Salesforce accepts this; check the listed pairs if the difference is not intended.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_FIELD_TYPES_DIFFER.md
```

## Related codes

- [`MAPPING_FIELD_NOT_FOUND`](../mapping/MAPPING_FIELD_NOT_FOUND.md) — a pair names a field missing on the DLO or DMO.
- [`MAPPING_ACTIVATES_STANDARD_DMO`](../mapping/MAPPING_ACTIVATES_STANDARD_DMO.md) — notice when a first mapping enables a standard DMO.
