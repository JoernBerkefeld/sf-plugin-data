# `UNSUPPORTED_DATA_GRAPH_CONFIGURATION`

> The data graph definition or the answer from the org has a shape the plugin cannot check. Retrieve the graph again to get a supported file, or simplify the definition, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data graph                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

The plugin checks every data graph definition it reads or sends: the local file, the graph returned by the org and the answers to its requests. This code means one of them did not have the expected shape, for example an unknown or missing key, a wrong value type, or a name that does not match. For a local file, the message names the key path, for example `definition.sourceObject.fields[0].futureKey is not a setting the plugin can send`.

Retrieve is lenient: a graph in any status is retrieved, keys the plugin does not model and `null` values are kept in the file as read, and empty generated names are left out. Deploy of such a file refuses with this code and names the key. A graph shape the file cannot hold at all (a schedule other than `{schedule: {frequency, timeGranularity}}`, or a node `jsonPath` other than `$` or `<parent path>.<name>`) is written as retrieved (verbatim) with this code as `verbatim.reason` and a warning; it is not an item failure.

## Why the plugin stops

A graph the plugin cannot check could be changed or deleted in a way you did not intend. The plugin stops before acting on it.

## How to fix

1. Retrieve the graph again (`sf data360 retrieve --metadata data-graph:<Name>`) and use that file as the base for your changes.
2. Remove or correct the key the message names; avoid hand-written keys the plugin does not model.
3. Rerun the command. A verbatim graph file cannot be deployed (`VERBATIM_NOT_DEPLOYABLE`); manage that graph in Salesforce.

## Example output

`sf data360 retrieve` writes a graph with a schedule of another shape as-is:

```text
Retrieve: success.
Warning: data-graph:CustomerGraph: retrieved as-is (verbatim, reason UNSUPPORTED_DATA_GRAPH_CONFIGURATION) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-graph:CustomerGraph (retrieved).
```

## Related codes

- [`NATIVE_GRAPH_RETRIEVE_BLOCKED`](../data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md) — a retrieve item failure; its message ends with the code of the cause.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of a verbatim graph file.
- [`UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION`](../identity-resolution/UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION.md) — the same check for identity resolution.
