# `STREAM_DATASPACE_MISMATCH`

> The stream file's c__dataSpace list does not name the run's data space, differs from its DLO's data spaces, or lists several for a new stream. Change spaces with the DLO file.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A stream file lists the data spaces of its landing DLO in its top-level `c__dataSpace` key. The list only mirrors the DLO: deploy checks it and never changes data spaces through a stream. This code means one of these:

- the list does not name the run's data space (`--dataspace`, or `default` when you leave it out);
- the stream exists and the list differs from the data spaces its DLO belongs to;
- the stream does not exist yet and the list names more than one data space. A new stream creates its landing DLO in the run's data space only.

## Why the plugin stops

Data space membership belongs to the DLO. Changing it through a stream file would hide a membership change in an unrelated file, so the plugin refuses the stream before any write.

## How to fix

1. For an existing stream, retrieve it again, or deploy the DLO file with the data spaces you want first and then retrieve the stream.
2. For a new stream, list only the run's data space, deploy, then add the other data spaces with the DLO file and retrieve the stream again.
3. Run the deploy with `--dataspace` set to a data space the list names.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
STREAM_DATASPACE_MISMATCH: The c__dataSpace list of WebOrders_Order_1a2b3c4d (default) does not name the run's data space dataspace2. Deploy it with --dataspace set to one of its data spaces. No write attempted; correct the reported check before another attempt.
Hint: The stream file's c__dataSpace list does not name the run's data space, differs from its DLO's data spaces, or lists several for a new stream. Change spaces with the DLO file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/STREAM_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`DLO_DATASPACE_MISMATCH`](../dlo/DLO_DATASPACE_MISMATCH.md) — the same check for data lake objects.
- [`UNSUPPORTED_STREAM_DATASPACE`](../data-stream/UNSUPPORTED_STREAM_DATASPACE.md) — the stream's DLO is not in the run's data space.
