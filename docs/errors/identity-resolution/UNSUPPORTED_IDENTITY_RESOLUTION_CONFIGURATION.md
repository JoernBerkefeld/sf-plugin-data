# `UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION`

> The ruleset lacks a required key or has a shape, value or name deploy cannot send. Retrieve keeps unknown keys and nulls, or writes the ruleset as-is; deploy refuses and names the key path.

|              |                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Identity resolution                                                                                                                       |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`                                                                                                |
| **Outcome**  | retrieve: `success` — written normally, or as-is (verbatim) with a warning when a required key is missing; deploy: `blocked` for the file |

## What it means

The plugin turns the ruleset returned by Salesforce into a portable file.

On retrieve it keeps what it does not model: unknown keys of the ruleset (in `spec`, after the known keys), of match rules, criteria, reconciliation rules, field overrides and sources, and `null` values. Names, uniqueness and size are not checked. Only a ruleset without a key the file needs (for example `label`, `secondaryDmo` or `reconciliationRules`), or with a list or object of another shape, is written as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`.

On deploy the file must be exactly what the plugin can send: no unknown keys, text and true/false values where expected, valid DMO, field and DLO API names, unique match rule labels, criteria, reconciliation entities and sources, plain JSON within the size limits. The message names the key path, for example `spec.futureKey` or `spec.matchRules[0].criteria[1].caseSensitiveMatch`.

## Why the plugin stops

A file the plugin cannot check could deploy differently from what is in the org, so deploy refuses it instead of dropping or guessing values.

## How to fix

1. Read the key path in the deploy message and correct or remove that value in the file.
2. For a verbatim file, change the ruleset in Data Cloud and retrieve it again; the normal file replaces the verbatim one.

Deploy skips a verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## Example output

```text
Retrieve: success.
Warning: identity-resolution:Individual_Example: retrieved as-is (verbatim, reason UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded identity-resolution:Individual_Example (retrieved).
```

## Related codes

- [`INCOMPLETE_IDENTITY_RESOLUTION`](../identity-resolution/INCOMPLETE_IDENTITY_RESOLUTION.md) — the answer had no definition at all.
- [`UNSUPPORTED_DATA_GRAPH_CONFIGURATION`](../data-graph/UNSUPPORTED_DATA_GRAPH_CONFIGURATION.md) — the same check for data graphs.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
