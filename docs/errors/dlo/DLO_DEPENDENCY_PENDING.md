# `DLO_DEPENDENCY_PENDING`

> Salesforce still lists the dependents this command deleted, so the DLO itself was not deleted. Wait until its dependency list is empty, then rerun the delete.

|              |                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                                        |
| **Commands** | `sf data360 delete`                                                                                     |
| **Outcome**  | `blocked` for the DLO — its DELETE was not sent; dependents deleted earlier in the command stay deleted |

## What it means

You selected a DLO together with its dependents. The command deleted the dependents first and then read the DLO's dependency list a limited number of times, waiting for it to become empty. The dependents were still listed after the last read.

Salesforce can take a while to drop a deleted component from the list.

## Why the plugin stops

Salesforce refuses to delete a DLO while it lists dependents. Sending the DELETE anyway would only produce a rejection. The plugin stops before it and tells you what is left.

## How to fix

1. Wait a few minutes.
2. Read the DLO's dependencies in the org (`sf api request rest /services/data/v68.0/ssot/data-lake-objects/<Name>__dll/dependencies`).
3. When the list is empty, run `sf data360 delete -m dlo:<Name>__dll` again. The dependents are already gone, so select only the DLO.

## Example output

```text
Delete: blocked.
deleted dmo Order__dlm
Blocked: dlo:Orders__dll; mutation: not-attempted.
DLO_DEPENDENCY_PENDING: Orders__dll was not deleted: the dependents deleted by this command are still listed by Salesforce. Read the data lake object's dependencies and delete it again once the list is empty. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: Salesforce still lists the dependents this command deleted, so the DLO itself was not deleted. Wait until its dependency list is empty, then rerun the delete.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DEPENDENCY_PENDING.md
```

## Related codes

- [`DLO_DEPENDENCY_EXISTS`](../dlo/DLO_DEPENDENCY_EXISTS.md) — dependents that the command does not delete.
- [`DLO_DELETE_NOT_CONFIRMED`](../dlo/DLO_DELETE_NOT_CONFIRMED.md) — the DELETE was sent but not confirmed.
