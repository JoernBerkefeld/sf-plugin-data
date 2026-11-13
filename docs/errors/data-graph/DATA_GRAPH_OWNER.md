# `DATA_GRAPH_OWNER`

> The graph root is a unified DMO created by the named identity resolution ruleset, which is published. No action is needed.

|              |                                                   |
| ------------ | ------------------------------------------------- |
| **Family**   | Data graph                                        |
| **Commands** | `sf data360 deploy --preview`                     |
| **Outcome**  | informational — the preview result is not changed |

## What it means

The root object of the graph is a unified DMO (creation type `Derived`). Such a DMO is created by an identity resolution ruleset. The preview found that ruleset in the target and it is `PUBLISHED`, so the graph can be built on it.

## Why the plugin reports it

A graph on a unified DMO depends on its identity resolution ruleset. The notice names that ruleset so you know which one the graph relies on, for example before you change or delete it.

## How to fix

Nothing to fix. Keep the named ruleset published while the graph uses it.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned create: data-graph:CustomerGraph.
DATA_GRAPH_OWNER: The graph root UnifiedIndividual__dlm is produced by identity resolution ruleset Individual_Main (PUBLISHED).
Hint: The graph root is a unified DMO created by the named identity resolution ruleset, which is published. No action is needed.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_OWNER.md
```

## Related codes

- [`DATA_GRAPH_OWNER_NOT_FOUND`](../data-graph/DATA_GRAPH_OWNER_NOT_FOUND.md) — no ruleset creates the root.
- [`DATA_GRAPH_OWNER_NOT_PUBLISHED`](../data-graph/DATA_GRAPH_OWNER_NOT_PUBLISHED.md) — the ruleset exists but is not published.
