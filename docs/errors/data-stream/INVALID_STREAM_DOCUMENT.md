# `INVALID_STREAM_DOCUMENT`

> A data stream document does not have the expected JSON structure. Retrieve the stream again, or compare the local file with a freshly retrieved one.

|              |                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                      |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; `failed` on retrieve — no file was written; `failed` with mutation `unknown` when it appears in the checks after a write |

## What it means

Every stream document (`data360/data-stream/<ApiName>.data-stream-meta.json`) has a fixed set of keys: `schemaVersion`, `kind`, `identity`, `spec` and an optional `observed`, each with their own required keys. Text values must be non-empty, without leading or trailing spaces or control characters, and at most 500 characters.

This code means a document did not meet those rules: a key is missing, an unknown key was added, or a text value is empty or malformed. On retrieve it can come from the document built from the org or from an existing local file being compared before it is overwritten. A deploy file that fails these rules is reported earlier as `INVALID_SOURCE`.

## Why the plugin stops

The plugin only reads and writes the exact structure it knows. An unknown key could be authored intent the plugin would silently ignore, so it refuses the document.

## How to fix

1. On retrieve, check whether the existing local file was edited by hand. Restore it from version control, or move it away and retrieve again.
2. Compare your file with a freshly retrieved one and remove keys the plugin does not know.
3. If the document built from the org fails, the stream has values the plugin cannot represent; report it.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_DOCUMENT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: A data stream document does not have the expected JSON structure. Retrieve the stream again, or compare the local file with a freshly retrieved one.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_DOCUMENT.md
Downloaded data-stream: 0
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the deploy-side report for a stream file that fails these checks.
- [`INVALID_STREAM_NAME`](../data-stream/INVALID_STREAM_NAME.md) — a name in the document is not a valid developer name.
- [`UNSUPPORTED_STREAM_SPEC`](../data-stream/UNSUPPORTED_STREAM_SPEC.md) — the structure is valid but a fixed value is unsupported.
