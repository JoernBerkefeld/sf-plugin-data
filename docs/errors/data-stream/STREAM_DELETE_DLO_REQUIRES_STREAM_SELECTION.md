# `STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION`

> --delete-dlo only applies to data stream deletion. Select data-stream:ApiName members, or remove --delete-dlo to delete other components.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 delete`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

`--delete-dlo` tells a stream delete to also delete the stream's linked DLO. This code means the flag was used without any `data-stream:<ApiName>` selector.

## Why the plugin stops

The flag has no meaning for other families. To delete a standalone DLO, select it with `-m dlo:<Name>__dll` instead, so the plugin refuses the ambiguous call.

## How to fix

1. To delete a stream and its DLO: `sf data360 delete -o <org> -m data-stream:<ApiName> --delete-dlo`.
2. To delete a DLO on its own: `sf data360 delete -o <org> -m dlo:<Name>__dll` without `--delete-dlo`.

## Example output

```text
Delete: blocked.
STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: --delete-dlo only applies to data stream deletion. Select data-stream:ApiName members, or remove --delete-dlo to delete other components.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION.md
```

## Related codes

- [`INVALID_STREAM_DELETE_SELECTION`](../data-stream/INVALID_STREAM_DELETE_SELECTION.md) — the stream selection itself is not valid.
