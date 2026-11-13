# `INVALID_MAPPING_FIELD`

> A field pair has an unknown key, a field name that is not Name__c, or repeats another pair or pair name. Fix the fieldMappings entries of the mapping file.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Mapping                                                         |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

Each `fieldMappings` entry may only have:

- `sourceFieldDeveloperName` and `targetFieldDeveloperName`, both custom-style field names ending in `__c`, and
- optionally `developerName`, the pair name Salesforce assigned.

No two entries may map the same source field onto the same target field (ignoring case), and no two may share a `developerName`. One entry broke these rules. The code also appears when a pair that must be removed has no pair name.

## Why the plugin stops

Repeated or malformed pairs make it unclear which pair to add or remove, so the plugin stops before any write.

## How to fix

1. Look for duplicated pairs or duplicated `developerName` values in `fieldMappings`.
2. Check that both field names end in `__c` and that no other keys are present.
3. Rerun with `--preview`.

## Example output

```text
Deploy preview: blocked (INVALID_MAPPING_FIELD). No deployment executed.
INVALID_MAPPING_FIELD: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: A field pair has an unknown key, a field name that is not Name__c, or repeats another pair or pair name. Fix the fieldMappings entries of the mapping file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_FIELD.md
```

## Related codes

- [`INVALID_MAPPING_DOCUMENT`](../mapping/INVALID_MAPPING_DOCUMENT.md) — the whole mapping definition breaks the file format.
- [`MAPPING_SELECTOR_REQUIRED`](../mapping/MAPPING_SELECTOR_REQUIRED.md) — an org pair has no pair name to remove it by.
