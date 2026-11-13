# `PARTIAL_STREAM_OUTPUT`

> The stream file was written, but the final check of its contents failed. Open data360/data-stream/<ApiName>.data-stream-meta.json, then retrieve again with --overwrite.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                           |
| **Commands** | `sf data360 retrieve`                                                                 |
| **Outcome**  | `failed` — the local file may be new, replaced or incomplete; the org was not changed |

## What it means

Retrieve writes a stream file in steps: it prepares the new content in a temporary folder, moves it into `data360/data-stream/`, and then reads it back. This code means the file was already moved into place when a later step failed, for example the read-back found different bytes because something else changed the file.

## Why the plugin stops

The plugin cannot vouch for a file it could not read back exactly, so it reports the retrieve as failed rather than successful.

## How to fix

1. Make sure no other tool or editor writes to `data360/data-stream/` during the retrieve.
2. Check the file with `git diff`.
3. Retrieve again with `sf data360 retrieve -m data-stream:<ApiName> --overwrite`.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: PARTIAL_STREAM_OUTPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The stream file was written, but the final check of its contents failed. Open data360/data-stream/<ApiName>.data-stream-meta.json, then retrieve again with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/PARTIAL_STREAM_OUTPUT.md
Downloaded data-stream: 0
```

## Related codes

- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — the file changed while the plugin was writing it.
- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — writing the file failed before it was in place.
