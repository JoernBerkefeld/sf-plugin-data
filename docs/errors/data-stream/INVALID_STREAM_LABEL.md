# `INVALID_STREAM_LABEL`

> The landing DLO label in spec.newDlo.label is longer than 40 characters. Shorten it to 40 characters or fewer.

|              |                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data stream                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete` |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written          |

## What it means

`spec.newDlo.label` is the label of the stream's landing DLO. The plugin accepts at most 40 characters there. This code means the label in the document is longer.

On retrieve and delete the label comes from the DLO in the org; on deploy it comes from your file (a file that fails already at reading is reported as `INVALID_SOURCE`).

## Why the plugin stops

The plugin checks this limit itself so that a create request does not fail half-way in Salesforce on a label that is too long.

## How to fix

1. Shorten `spec.newDlo.label` in the stream file to 40 characters or fewer, then deploy again.
2. If the label came from the org, shorten the DLO label in Data Cloud Setup and retrieve again.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_LABEL: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The landing DLO label in spec.newDlo.label is longer than 40 characters. Shorten it to 40 characters or fewer.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_LABEL.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_STREAM_DOCUMENT`](../data-stream/INVALID_STREAM_DOCUMENT.md) — other structural problems in the document.
- [`UNSUPPORTED_STREAM_SETTINGS_CHANGE`](../data-stream/UNSUPPORTED_STREAM_SETTINGS_CHANGE.md) — a label differs from the existing stream.
