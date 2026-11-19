# `IDENTITY_RESOLUTION_NAME_NOT_STORED`

> In a non-default data space Salesforce names a ruleset <prefix>_<type>_<rulesetId>; this file's name lacks the prefix, so a create could not be read back. Nothing was sent; rename the file and identity.apiName, or retrieve the ruleset.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Salesforce names a ruleset `<type>_<rulesetId>` in the default data space and `<prefix>_<type>_<rulesetId>` in another one, where the prefix comes from the org's data space list (`ds2_Individual_cx2a` in `dataspace2`, live API 68). The file carries the name Salesforce stores. This code means a file of a non-default data space has a name without the prefix of that data space, or the org's data space list names no prefix for it.

## Why the plugin stops

The create sends only the ruleset ID; Salesforce adds the prefix. A file without it would create a ruleset the plugin could not find again under the file's name, so the deploy stops before anything is sent.

## How to fix

1. Name the file and `identity.apiName` `<prefix>_<type>_<rulesetId>`, for example `ds2_Individual_cx2a`.
2. Or retrieve the ruleset in that data space to get a file with the stored name.

## Example output

```text
Deploy preview: blocked. Nothing was sent to the org.
Data space: dataspace2.
IDENTITY_RESOLUTION_NAME_NOT_STORED: Salesforce names a ruleset of the data space dataspace2 ds2_<type>_<rulesetId>, so ruleset Individual_cx2a would be stored as ds2_Individual_cx2a and not be found again under the name of the file. Name the file and identity.apiName ds2_Individual_cx2a, or retrieve the ruleset.
```

## Related codes

- [`IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH`](../identity-resolution/IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH.md) — a new ruleset name does not follow its type.
- [`SEGMENT_NAME_NOT_STORED`](../segment/SEGMENT_NAME_NOT_STORED.md) — the same rule for segments.
