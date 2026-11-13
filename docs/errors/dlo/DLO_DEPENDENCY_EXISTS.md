# `DLO_DEPENDENCY_EXISTS`

> Other components still depend on this DLO. Delete the listed dependents first, or select them in the same command as dmo:<Name> or mapping:<Name>.

|              |                                              |
| ------------ | -------------------------------------------- |
| **Family**   | Data lake object                             |
| **Commands** | `sf data360 delete`                          |
| **Outcome**  | `blocked` — nothing was changed for this DLO |

## What it means

Salesforce lists components that depend on the DLO, for example a data model object it is mapped to. At least one of them is not deleted by the same command. The message names each dependent by type and name.

The check runs for every selected DLO before the command's first write. It runs again while the command waits for dependents it deleted to clear; a dependent that appears only then gives this code too.

## Why the plugin stops

Salesforce refuses to delete a DLO while anything depends on it. Checking first means the command stops before it deletes anything, instead of deleting half of a selection and failing on the DLO.

## How to fix

1. Read the list of dependents in the message.
2. Either delete them first, or add them to the same command: a data model object as `-m dmo:<Name>__dlm`, and every mapping between this DLO and that object as `-m mapping:<Name>`.
3. Rerun `sf data360 delete`. The command deletes mappings and data model objects before the DLO.

## Example output

```text
Delete: blocked.
Blocked: dlo:Orders__dll; mutation: not-attempted.
DLO_DEPENDENCY_EXISTS: Orders__dll cannot be deleted while Salesforce lists dependents: DataModelObject Order__dlm. Delete them first, or select them in the same command (a data model object as dmo:<Name>, or every mapping between this data lake object and it as mapping:<Name>). Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: Other components still depend on this DLO. Delete the listed dependents first, or select them in the same command as dmo:<Name> or mapping:<Name>.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DEPENDENCY_EXISTS.md
```

## Related codes

- [`DLO_DEPENDENCY_PENDING`](../dlo/DLO_DEPENDENCY_PENDING.md) — the selected dependents were deleted but are still listed.
- [`DLO_DEPENDENCIES_UNCONFIRMED`](../dlo/DLO_DEPENDENCIES_UNCONFIRMED.md) — the dependency list could not be read.
