# `DATA_GRAPH_DRAFT`

> The data graph is a draft that was never built, so it was retrieved as-is. A draft cannot be deployed or edited through the API; build or edit it in Salesforce. A delete removes it.

|              |                                                      |
| ------------ | ---------------------------------------------------- |
| **Family**   | Data graph                                           |
| **Commands** | `sf data360 retrieve`, `sf data360 delete`           |
| **Outcome**  | `success` with a warning — the file is written as-is |

## What it means

The graph reads with status `draft`: it was saved as a draft and has not been built. A draft keeps exactly what was saved, which can include settings a built graph never has (for example no refresh schedule, no node type, or node paths the build would replace).

Retrieve writes such a graph as Salesforce returned it (verbatim), with this code as `verbatim.reason` and a warning. It is not an item failure.

## Why the plugin reports it

A normal graph file has no draft status, so a deploy of it would build a graph instead of saving a draft. Salesforce also refuses to edit a draft through the API (it accepts edits only for an active graph or one in error). Keeping the file as-is records the draft without implying that it can be deployed.

## How to fix

1. Build or edit the draft in Salesforce.
2. Once it is built, retrieve it again (`sf data360 retrieve --metadata data-graph:<Name>`) to get a normal file that deploys.

A verbatim graph file cannot be deployed: a deploy skips it in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

To remove the draft instead, delete it: `sf data360 delete --metadata data-graph:<Name>`, or delete its file and run `sf data360 delete --changed-since <ref>`. The delete reads the draft by name, requires it to be in the default data space with no node or field reporting dependencies or segments, and sends one DELETE; Salesforce's answer decides.

## Example output

```text
Retrieve: success.
Warning: data-graph:CustomerDraft: retrieved as-is (verbatim, reason DATA_GRAPH_DRAFT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-graph:CustomerDraft (retrieved).
```

## Related codes

- [`UNSUPPORTED_DATA_GRAPH_CONFIGURATION`](../data-graph/UNSUPPORTED_DATA_GRAPH_CONFIGURATION.md) — a built graph with a shape the plugin cannot represent; also written as-is.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of a verbatim graph file.
