# `UNSUPPORTED_STREAM_DATASPACE`

> The stream's landing DLO does not belong to the run's data space. Run the command with --dataspace set to one of the data spaces of that DLO.

|              |                                                                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                           |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                                       |
| **Outcome**  | `failed` for that stream on retrieve — no file was written, the other items are still retrieved; `blocked` on deploy and delete — nothing was changed |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when you leave it out. A data stream belongs to the data spaces of its landing DLO. This code means the stream's DLO does not belong to the run's data space.

## Why the plugin stops

Selection is per data space. The plugin never retrieves, changes or deletes a stream in a data space you did not ask for.

## How to fix

1. Look up the data spaces of the stream's DLO (its stream file lists them in `c__dataSpace`).
2. Run the command with `--dataspace` set to one of them.

## Example output

```text
Retrieve: partial.
data-stream:WebOrders_Order_1a2b3c4d: UNSUPPORTED_STREAM_DATASPACE: Data stream retrieval did not complete; no write attempted.
Hint: The stream's landing DLO does not belong to the run's data space. Run the command with --dataspace set to one of the data spaces of that DLO.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_DATASPACE.md
```

## Related codes

- [`STREAM_DATASPACE_MISMATCH`](../data-stream/STREAM_DATASPACE_MISMATCH.md) — the stream file's data space list does not fit the run or the DLO.
- [`UNSUPPORTED_DLO_DATASPACE`](../dlo/UNSUPPORTED_DLO_DATASPACE.md) — the same check for data lake objects.
