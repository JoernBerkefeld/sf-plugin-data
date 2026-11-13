# `DLO_DEPENDENCIES_UNCONFIRMED`

> The dependency list of the DLO could not be read in the expected form, so the delete was not started. Check access to the DLO in the org and rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data lake object                |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before it deletes anything, `sf data360 delete` asks Salesforce which components depend on each selected DLO. The answer must be a list where every entry names a component type and a name. The answer did not have that form: the list was missing, or an entry lacked its type or name.

If the code appears while the plugin waits for dependents to clear (after it deleted them in the same command), earlier items of the command may already be deleted.

## Why the plugin stops

Salesforce refuses to delete a DLO that still has dependents, and the plugin uses the list to check this up front. Without a readable list it cannot tell whether the delete is safe or which dependents you would need to select, so it does not start.

## How to fix

1. Make sure the user of `--target-org` can read the DLO and its dependencies.
2. Read the dependency list yourself (`sf api request rest /services/data/v68.0/ssot/data-lake-objects/<Name>__dll/dependencies`) to see what Salesforce returns.
3. Rerun the delete. If earlier items were deleted, check the item lines of the output first.

## Example output

```text
Delete: blocked.
Blocked: dlo:Orders__dll; mutation: not-attempted.
DLO_DEPENDENCIES_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The dependency list of the DLO could not be read in the expected form, so the delete was not started. Check access to the DLO in the org and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DEPENDENCIES_UNCONFIRMED.md
```

## Related codes

- [`DLO_DEPENDENCY_EXISTS`](../dlo/DLO_DEPENDENCY_EXISTS.md) — the list was read and names dependents that are not selected.
- [`DLO_DEPENDENCY_PENDING`](../dlo/DLO_DEPENDENCY_PENDING.md) — deleted dependents are still listed.
