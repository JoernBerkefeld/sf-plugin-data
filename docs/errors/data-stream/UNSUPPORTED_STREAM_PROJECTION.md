# `UNSUPPORTED_STREAM_PROJECTION`

> The stream has a mapping the plugin cannot represent in the file, such as a formula or a mapping onto a key or non-Text field. Manage those mappings in Salesforce.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

When the plugin turns a stream into a file, it keeps three kinds of mappings: each source field mapped to the field of the same name, the two system mappings for data source and data source object, and extra mappings from a source field label to a new non-key Text field. This code means the stream has a mapping of another kind, for example a real formula, a mapping onto the primary key or a non-Text field, or a source field mapped under another name.

Deploy and delete read the stream the same way, so they stop too.

## Why the plugin stops

Leaving such a mapping out of the file would hide part of the stream. A later deploy could then be compared against an incomplete picture, so the plugin refuses instead.

## How to fix

1. Look at the stream's mappings in Data Cloud Setup.
2. If you need the plugin to manage the stream, remove or simplify the unsupported mappings there.
3. Otherwise manage this stream in Salesforce directly.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: UNSUPPORTED_STREAM_PROJECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The stream has a mapping the plugin cannot represent in the file, such as a formula or a mapping onto a key or non-Text field. Manage those mappings in Salesforce.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/UNSUPPORTED_STREAM_PROJECTION.md
Downloaded data-stream: 0
```

## Related codes

- [`UNSUPPORTED_STREAM_READ`](../data-stream/UNSUPPORTED_STREAM_READ.md) — the stream itself is outside the supported profile.
