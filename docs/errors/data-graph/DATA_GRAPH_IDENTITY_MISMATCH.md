# `DATA_GRAPH_IDENTITY_MISMATCH`

> The org answered the read of a data graph with a different graph name than the one selected. Check the exact name, including case, in --metadata data-graph:<Name> and in the file, then rerun.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Data graph                                       |
| **Commands** | `sf data360 retrieve`, `sf data360 delete`       |
| **Outcome**  | `blocked` — no file was written, nothing deleted |

## What it means

The plugin reads a data graph by its exact name and expects the answer to carry that same name in `name`. The answer named another graph.

## Why the plugin stops

A retrieve would otherwise write another graph's definition under the selected name, and a delete would act on a graph other than the one the file or selector names. The item is reported as a failure instead; it is never written as-is (verbatim). Other items of the same run continue.

## How to fix

1. Check the exact API name of the graph in the org, including case.
2. Use that name in `--metadata data-graph:<Name>`, in the file name and in `definition.name`.
3. Rerun the command.

## Example output

```text
DATA_GRAPH_IDENTITY_MISMATCH: Data graph configuration could not be admitted.
Hint: The org answered the read of a data graph with a different graph name than the one selected. Check the exact name, including case, in --metadata data-graph:<Name> and in the file, then rerun.
```

## Related codes

- [`NATIVE_GRAPH_RETRIEVE_BLOCKED`](../data-graph/NATIVE_GRAPH_RETRIEVE_BLOCKED.md) — the graph could not be retrieved for another reason.
- [`UNSUPPORTED_DATA_GRAPH_CONFIGURATION`](../data-graph/UNSUPPORTED_DATA_GRAPH_CONFIGURATION.md) — the graph has a shape the plugin cannot check.
