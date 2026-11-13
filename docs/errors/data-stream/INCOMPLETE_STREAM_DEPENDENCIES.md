# `INCOMPLETE_STREAM_DEPENDENCIES`

> Salesforce's dependency list for the stream or its DLO was incomplete or had an unexpected shape. Rerun the delete; if the result says mutation unknown, inspect the org first.

|              |                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                 |
| **Commands** | `sf data360 delete`                                                                                                                         |
| **Outcome**  | `blocked` before the DELETE request — nothing was changed; `failed` with mutation `unknown` when it appears in the checks after the request |

## What it means

Before deleting a stream, the plugin reads what depends on the stream and on its linked DLO. When the DLO is kept, it reads the DLO's dependencies again after the delete. This code means one of those answers did not have the expected form: unknown fields, no dependency list, or a total that does not match the number of entries.

## Why the plugin stops

The plugin deletes a stream only when it can prove that nothing else depends on it. An answer it cannot read in full cannot prove that, so it stops.

## How to fix

1. If `mutation` is `not-attempted`, rerun the delete, with `--preview` first.
2. If `mutation` is `unknown`, the stream may already be deleted. Check the stream and its DLO in Data Cloud Setup before anything else.
3. If the code keeps appearing, the API answer has changed shape; report it.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
INCOMPLETE_STREAM_DEPENDENCIES: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No deletion attempted; correct the reported check before another attempt.
Hint: Salesforce's dependency list for the stream or its DLO was incomplete or had an unexpected shape. Rerun the delete; if the result says mutation unknown, inspect the org first.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INCOMPLETE_STREAM_DEPENDENCIES.md
```

## Related codes

- [`STREAM_DELETE_DEPENDENCIES_BLOCKED`](../data-stream/STREAM_DELETE_DEPENDENCIES_BLOCKED.md) — the list was complete and showed a dependency.
