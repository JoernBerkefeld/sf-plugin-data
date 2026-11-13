# `DEPENDENCY_CYCLE`

> The selected components depend on each other in a loop, so no safe order exists. Split the selection or remove the circular reference, then rerun.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Dependency                                 |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve` |
| **Outcome**  | `blocked` — nothing was changed or written |

## What it means

The plugin orders the selection so that every component comes after the components it depends on. Here two or more selected components depend on each other, directly or through others, so no such order exists.

## Why the plugin stops

In a loop, every component waits for another one to exist first. Any order the plugin picked would deploy something before its prerequisite.

## How to fix

1. Look at the dependencies of the selected components (for example the DMOs a segment or calculated insight uses).
2. Remove the circular reference, or deploy the parts in separate commands in an order that works.
3. Rerun.

## Example output

```text
Deploy execution: blocked (DEPENDENCY_CYCLE). No automatic retry or rollback performed.
DEPENDENCY_CYCLE: Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The selected components depend on each other in a loop, so no safe order exists. Split the selection or remove the circular reference, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_CYCLE.md
```

## Related codes

- [`DEPENDENCY_LIMIT_EXCEEDED`](../dependency/DEPENDENCY_LIMIT_EXCEEDED.md) — the selection is too large to order.
- [`DEPENDENCY_DUPLICATE_IDENTITY`](../dependency/DEPENDENCY_DUPLICATE_IDENTITY.md) — two files describe the same component.
