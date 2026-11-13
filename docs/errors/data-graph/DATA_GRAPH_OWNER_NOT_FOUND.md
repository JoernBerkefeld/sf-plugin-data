# `DATA_GRAPH_OWNER_NOT_FOUND`

> The graph root is a unified DMO, but no identity resolution ruleset in the target creates it. Deploy the ruleset that produces it first, then preview the graph again.

|              |                                               |
| ------------ | --------------------------------------------- |
| **Family**   | Data graph                                    |
| **Commands** | `sf data360 deploy --preview`                 |
| **Outcome**  | `blocked` — preview only, nothing was changed |

## What it means

The root object of the graph is a unified DMO (creation type `Derived`), which an identity resolution ruleset creates. The preview looked for that ruleset in the target and found none.

## Why the plugin stops

A real deploy sends the graph as written and Salesforce decides. A graph whose root has no ruleset behind it would fail there or be built on stale data. The preview reports it now so you can fix the order. Only `--preview` makes this check.

## How to fix

1. Deploy the identity resolution ruleset that creates the root DMO (`sf data360 deploy` with its `.identityResolution.json` file and `--allow-processing`).
2. Wait until it is published.
3. Preview the graph again.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_FAILED). No deployment executed.
Planned blocked: data-graph:CustomerGraph.
DATA_GRAPH_OWNER_NOT_FOUND: No identity resolution ruleset in the target produces the graph root UnifiedIndividual__dlm.
Hint: The graph root is a unified DMO, but no identity resolution ruleset in the target creates it. Deploy the ruleset that produces it first, then preview the graph again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_OWNER_NOT_FOUND.md
```

## Related codes

- [`DATA_GRAPH_OWNER_NOT_PUBLISHED`](../data-graph/DATA_GRAPH_OWNER_NOT_PUBLISHED.md) — the ruleset exists but is not published.
- [`DATA_GRAPH_ROOT_NOT_FOUND`](../data-graph/DATA_GRAPH_ROOT_NOT_FOUND.md) — the root DMO itself is missing.
