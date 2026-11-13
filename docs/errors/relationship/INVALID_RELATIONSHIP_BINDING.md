# `INVALID_RELATIONSHIP_BINDING`

> A DMO name used to list relationships is not a valid DMO API name. Check the relationship:Name__dlm selector or the source object in the relationship file.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Relationship                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

Relationships are read through the list of a DMO. The DMO name given for that list does not start with a letter, uses characters other than letters, digits and underscores, is longer than 200 characters before its suffix, or does not end in `__dlm`.

## Why the plugin stops

The name becomes part of the request URL. The plugin sends only names that are valid DMO API names.

## How to fix

1. Check the `relationship:<Dmo__dlm>` selector of a retrieve.
2. Check `spec.sourceObjectName` in the relationship file of a deploy or delete.
3. Rerun with the corrected name.

## Example output

```text
Retrieve: failed.
relationship:Order__dlm: INVALID_RELATIONSHIP_BINDING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Relationship retrieval did not complete for this item; the org was not changed.
Hint: A DMO name used to list relationships is not a valid DMO API name. Check the relationship:Name__dlm selector or the source object in the relationship file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/INVALID_RELATIONSHIP_BINDING.md
Downloaded relationship: 0
```

## Related codes

- [`INVALID_RELATIONSHIP_NAME`](../relationship/INVALID_RELATIONSHIP_NAME.md) — The relationship name itself is not valid.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — A selector that is not valid.
