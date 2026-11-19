# `IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE`

> A DMO, DLO source or unified output the ruleset names is in another data space than the ruleset. Name the component of the ruleset's own data space (ds2_Individual__dlm with FirstName__c outside default), then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Identity resolution                      |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

A ruleset and everything it names are in one data space: the secondary DMO, the match and reconciliation entities and their fields, the DLO sources and the unified and link outputs. Before any write the plugin reads each DMO with `?dataspace=` of the ruleset's data space and each DLO source with its data space list. This code means a DMO read names another data space, or a DLO source does not belong to the ruleset's.

Outside `default` the names are those Salesforce stores there: `ds2_Individual__dlm` with `FirstName__c` (no `ssot__`), and outputs such as `ds2_UnifiedIndividualCx2a__dlm` (live API 68).

## Why the plugin stops

Salesforce refuses a ruleset on DMOs of another data space, and a reference into another data space would make the ruleset differ from the file. The command stops before any write.

## How to fix

1. Name each DMO and field as it is stored in the ruleset's data space, for example `ds2_Individual__dlm` and `FirstName__c` in `dataspace2`.
2. Add each DLO source to the ruleset's data space (its `c__dataSpace` list) and map the entities there first.

## Example output

```text
Deploy preview: blocked. Nothing was sent to the org.
Data space: dataspace2.
IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE: The ruleset names the DMO ssot__Individual__dlm, which is in the data space default, not in the ruleset's data space dataspace2. Name the component of the ruleset's data space (outside default a standard DMO copy is <prefix>_<Name> with fields without ssot__); nothing was written.
```

## Related codes

- [`IDENTITY_RESOLUTION_BINDING_UNQUALIFIED`](../identity-resolution/IDENTITY_RESOLUTION_BINDING_UNQUALIFIED.md) — a referenced DMO or field could not be verified.
- [`IDENTITY_RESOLUTION_DATASPACE_MISMATCH`](../identity-resolution/IDENTITY_RESOLUTION_DATASPACE_MISMATCH.md) — the ruleset itself is in another data space than the run.
