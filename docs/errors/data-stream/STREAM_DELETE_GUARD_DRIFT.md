# `STREAM_DELETE_GUARD_DRIFT`

> The stream, its connection or source fields changed during the delete checks or after the request. Inspect the stream in the org, then rerun the delete with --preview.

|              |                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                 |
| **Commands** | `sf data360 delete`                                                                                                                         |
| **Outcome**  | `blocked` before the DELETE request — nothing was changed; `failed` with mutation `unknown` when it appears in the checks after the request |

## What it means

The plugin runs its delete checks twice and compares the results before it sends the DELETE request. After the request it also checks that the connection and source fields are the same and that no other stream took the stream's place. The message names the check and the first difference.

## Why the plugin stops

A change during the delete means something else is working on the same stream or connection. Deleting on top of that could remove something other than what was checked.

## How to fix

1. Read the difference in the message.
2. Make sure no other user, job or deploy changes the stream or its connection.
3. If `mutation` is `unknown`, check in Data Cloud Setup whether the stream still exists.
4. Rerun with `--preview`, then without.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_DELETE_GUARD_DRIFT: Plugin verification failed during delete pre-dispatch guard recheck for "WebOrders_Order_1a2b3c4d": state.binding.sourceFields.length: expected 3; observed 4. No deletion attempted; correct the reported check before another attempt.
Hint: The stream, its connection or source fields changed during the delete checks or after the request. Inspect the stream in the org, then rerun the delete with --preview.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_GUARD_DRIFT.md
```

## Related codes

- [`STREAM_BINDING_DRIFT`](../data-stream/STREAM_BINDING_DRIFT.md) — reads of the stream disagreed.
- [`STREAM_DELETE_PARENT_DRIFT`](../data-stream/STREAM_DELETE_PARENT_DRIFT.md) — the kept DLO changed.
