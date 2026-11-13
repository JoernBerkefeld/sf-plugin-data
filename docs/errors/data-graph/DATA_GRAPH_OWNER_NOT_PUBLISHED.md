# `DATA_GRAPH_OWNER_NOT_PUBLISHED`

> The identity resolution ruleset that creates the graph root is not published yet. Wait until it is PUBLISHED (rerun its deploy to check), then preview the graph again.

|              |                                               |
| ------------ | --------------------------------------------- |
| **Family**   | Data graph                                    |
| **Commands** | `sf data360 deploy --preview`                 |
| **Outcome**  | `blocked` — preview only, nothing was changed |

## What it means

The root object of the graph is a unified DMO created by an identity resolution ruleset. That ruleset exists in the target, but its status is not `PUBLISHED` (for example `PUBLISHING` right after a deploy, or an unpublished ruleset). The message shows the status.

## Why the plugin stops

A graph on a unified DMO needs a published ruleset behind it. The preview reports this before you deploy the graph. Only `--preview` makes this check; a real deploy sends the graph and Salesforce decides.

## How to fix

1. If the ruleset was just deployed (for example with `--async`), wait a few minutes. Rerun its deploy: `unchanged` means it is published, `IDENTITY_RESOLUTION_NOT_SETTLED` means it is still publishing.
2. If the ruleset is not meant to stay unpublished, publish it.
3. Preview the graph again.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_FAILED). No deployment executed.
Planned blocked: data-graph:CustomerGraph.
DATA_GRAPH_OWNER_NOT_PUBLISHED: Identity resolution ruleset Individual_Main produces the graph root UnifiedIndividual__dlm but is PUBLISHING; publish it before deploying the graph.
Hint: The identity resolution ruleset that creates the graph root is not published yet. Wait until it is PUBLISHED (rerun its deploy to check), then preview the graph again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-graph/DATA_GRAPH_OWNER_NOT_PUBLISHED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — how a ruleset deploy reports that it is still publishing.
- [`DATA_GRAPH_OWNER_NOT_FOUND`](../data-graph/DATA_GRAPH_OWNER_NOT_FOUND.md) — no ruleset creates the root.
