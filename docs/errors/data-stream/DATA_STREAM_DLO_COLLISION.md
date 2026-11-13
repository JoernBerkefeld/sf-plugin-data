# `DATA_STREAM_DLO_COLLISION`

> A DLO file in the selection names the landing DLO of a data stream this deploy would create. The new stream creates and owns that DLO: remove the DLO file from the selection, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The deploy selection holds a data stream that does not exist in the target yet and a DLO file whose name equals the stream's landing DLO (`spec.newDlo.name` in the stream file). The check runs on the stream's read-only comparison at the start of the stream phase, before any write. The run warning names the DLO and the stream. A DLO file beside a stream that already exists is not refused; it deploys in the native phase and Salesforce decides.

## Why the plugin stops

A new data stream creates its landing DLO and owns it. Deploying the DLO file as well would write the same object from two files right after the stream creates it. The plugin refuses the whole deploy before its first write.

## How to fix

1. Remove the DLO file (or the `dlo:<Name>__dll` member) from the selection; the stream file describes that DLO.
2. With `--changed-since`, deploy the stream with an explicit selection first; once it exists, its DLO file may be deployed beside it.
3. Rerun the deploy.

## Example output

```text
Deploy preview: blocked (DATA_STREAM_DLO_COLLISION). No deployment executed.
DATA_STREAM_DLO_COLLISION: Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: A DLO file in the selection names the landing DLO of a data stream this deploy would create. The new stream creates and owns that DLO: remove the DLO file from the selection, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/DATA_STREAM_DLO_COLLISION.md
```

## Related codes

- [`INVALID_STREAM_DELETE_SELECTION`](../data-stream/INVALID_STREAM_DELETE_SELECTION.md) — selection rules for `sf data360 delete` of streams.
