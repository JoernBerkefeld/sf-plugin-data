# `STREAM_FILENAME_COLLISION`

> The output folder has a file whose name differs from the stream file only by case or trailing dots or spaces, or the existing file holds another stream. Rename or move it.

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| **Family**   | Data stream                                             |
| **Commands** | `sf data360 retrieve`                                   |
| **Outcome**  | `failed` — no file was written; the org was not changed |

## What it means

Retrieve writes `data360/data-stream/<ApiName>.data-stream-meta.json`. This code means one of two things:

- the folder holds a file with nearly the same name, differing only by upper and lower case or by trailing dots or spaces, or
- the file with that name exists but its `identity.apiName` is a different stream.

## Why the plugin stops

On Windows and macOS such names often point to the same file, and Git handles them inconsistently. Writing would risk overwriting another stream's file, so the plugin refuses.

## How to fix

1. Look in `data360/data-stream/` for the similar name.
2. Rename or move the other file so that only one name remains.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: STREAM_FILENAME_COLLISION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The output folder has a file whose name differs from the stream file only by case or trailing dots or spaces, or the existing file holds another stream. Rename or move it.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_FILENAME_COLLISION.md
Downloaded data-stream: 0
```

## Related codes

- [`STREAM_DATASPACE_COLLISION`](../data-stream/STREAM_DATASPACE_COLLISION.md) — the existing file belongs to another data space.
- [`OVERWRITE_REQUIRED`](../general/OVERWRITE_REQUIRED.md) — the existing file is for the same stream and needs `--overwrite`.
