# `STREAM_DELETE_DEPENDENCIES_BLOCKED`

> Something still depends on the stream or its DLO. Remove those dependencies, such as mappings or segments, then rerun the delete; inspect the org first if mutation is unknown.

|              |                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                 |
| **Commands** | `sf data360 delete`                                                                                                                         |
| **Outcome**  | `blocked` before the DELETE request — nothing was changed; `failed` with mutation `unknown` when it appears in the checks after the request |

## What it means

Before deleting, the plugin reads the dependencies of the stream and of its linked DLO. It deletes only when the stream has no dependencies and the DLO's only dependency is this stream.

The code also appears after the delete when the DLO is kept (no `--delete-dlo`): the plugin reads the DLO's dependencies again and expects none, and the stream to be gone.

## Why the plugin stops

Deleting a stream or DLO that other components use would break them. The plugin does not remove those components for you, so it stops.

## How to fix

1. Open the stream and its DLO in Data Cloud Setup and look at what uses them (mappings to DMOs, segments, calculated insights and so on).
2. Remove or change those dependencies first, with `sf data360 delete` for the components the plugin supports.
3. Rerun the stream delete with `--preview`, then without.
4. If `mutation` is `unknown`, the stream was probably deleted; check it before anything else.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_DELETE_DEPENDENCIES_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No deletion attempted; correct the reported check before another attempt.
Hint: Something still depends on the stream or its DLO. Remove those dependencies, such as mappings or segments, then rerun the delete; inspect the org first if mutation is unknown.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_DEPENDENCIES_BLOCKED.md
```

## Related codes

- [`INCOMPLETE_STREAM_DEPENDENCIES`](../data-stream/INCOMPLETE_STREAM_DEPENDENCIES.md) — the dependency answer could not be read in full.
- [`STREAM_DELETE_PARENT_DRIFT`](../data-stream/STREAM_DELETE_PARENT_DRIFT.md) — the kept DLO changed during the delete.
