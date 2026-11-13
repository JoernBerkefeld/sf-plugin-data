# `DEPENDENCY_LIMIT_EXCEEDED`

> The selection has more than 256 components or 512 dependency links. Split it into smaller selections and run them one after another.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Dependency                                 |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve` |
| **Outcome**  | `blocked` — nothing was changed or written |

## What it means

One command handles at most 256 components and 512 links between them. The selection is larger.

## Why the plugin stops

Each component is checked against the org, sometimes several times. The limits keep a single run bounded in time and requests.

## How to fix

1. Split the selection into smaller groups.
2. Run the groups in dependency order: prerequisites (DMOs) first, then the components that use them.

## Example output

```text
Deploy execution: blocked (DEPENDENCY_LIMIT_EXCEEDED). No automatic retry or rollback performed.
DEPENDENCY_LIMIT_EXCEEDED: Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The selection has more than 256 components or 512 dependency links. Split it into smaller selections and run them one after another.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_LIMIT_EXCEEDED.md
```

## Related codes

- [`DEPENDENCY_REQUEST_LIMIT_EXCEEDED`](../dependency/DEPENDENCY_REQUEST_LIMIT_EXCEEDED.md) — the retrieve needs too many reads.
