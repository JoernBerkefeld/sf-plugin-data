# `STREAM_DATASPACE_COLLISION`

> A local stream file with this name already exists for a different data space. Move or rename that file, then rerun the retrieve.

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| **Family**   | Data stream                                             |
| **Commands** | `sf data360 retrieve`                                   |
| **Outcome**  | `failed` — no file was written; the org was not changed |

## What it means

Retrieve writes `data360/data-stream/<ApiName>.data-stream-meta.json`. A file with that name already exists and has the same stream name, but its `identity.dataSpace` differs from the retrieved stream.

## Why the plugin stops

The two files describe different targets. Overwriting would silently change which data space the file belongs to, even with `--overwrite`, so the plugin refuses.

## How to fix

1. Open the existing file and check its `identity.dataSpace`.
2. Move it out of `data360/data-stream/` or rename it.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: STREAM_DATASPACE_COLLISION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: A local stream file with this name already exists for a different data space. Move or rename that file, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DATASPACE_COLLISION.md
Downloaded data-stream: 0
```

## Related codes

- [`STREAM_FILENAME_COLLISION`](../data-stream/STREAM_FILENAME_COLLISION.md) — the existing file belongs to another stream name.
- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — the existing file is for the same stream and needs `--overwrite`.
