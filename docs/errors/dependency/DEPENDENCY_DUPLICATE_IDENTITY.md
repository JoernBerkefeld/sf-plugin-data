# `DEPENDENCY_DUPLICATE_IDENTITY`

> Two selected files define the same component (same type and API name). Keep one file per component in the selection, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Dependency                      |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The selection contains two different files that describe the same component, for example two segment files with the same API name in different folders. Selecting the same file twice is fine; two files are not.

## Why the plugin stops

The plugin cannot know which of the two files you want deployed, and deploying both would let the second silently replace the first.

## How to fix

1. Find the two files with the same type and API name.
2. Remove one from the selection (or from the project), then rerun.

## Example output

```text
Deploy execution: blocked (DEPENDENCY_DUPLICATE_IDENTITY). No automatic retry or rollback performed.
DEPENDENCY_DUPLICATE_IDENTITY: Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: Two selected files define the same component (same type and API name). Keep one file per component in the selection, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_DUPLICATE_IDENTITY.md
```

## Related codes

- [`DEPENDENCY_CYCLE`](../dependency/DEPENDENCY_CYCLE.md) — the selection cannot be ordered.
