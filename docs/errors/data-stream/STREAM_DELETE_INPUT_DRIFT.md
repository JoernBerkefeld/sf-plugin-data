# `STREAM_DELETE_INPUT_DRIFT`

> The delete options changed while the command ran. Nothing more was sent; rerun the delete with the options you want.

|              |                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                 |
| **Commands** | `sf data360 delete`                                                                                                         |
| **Outcome**  | `blocked` before the DELETE request — nothing was changed; `failed` with mutation `unknown` if it appears after the request |

## What it means

The plugin records the selection, API version, data space, `--delete-dlo`, `--preview` and target org at the start of a stream delete, and compares them again before each step. This code means they no longer matched.

From the command line this should not happen; it guards against the options being changed by code that calls the command.

## Why the plugin stops

The checks were made for the original options. Going on with different options would delete something that was not checked.

## How to fix

1. Rerun the delete with the options you want, with `--preview` first.
2. If `mutation` is `unknown`, check the stream in Data Cloud Setup first.

## Example output

```text
Delete: blocked.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_DELETE_INPUT_DRIFT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No deletion attempted; correct the reported check before another attempt.
Hint: The delete options changed while the command ran. Nothing more was sent; rerun the delete with the options you want.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_INPUT_DRIFT.md
```

## Related codes

- [`STREAM_DELETE_GUARD_DRIFT`](../data-stream/STREAM_DELETE_GUARD_DRIFT.md) — the org changed rather than the options.
