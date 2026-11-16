# `INVALID_STREAM_DOCUMENT`

> A data stream document does not have the expected JSON structure. Retrieve the stream again, or compare the local file with a freshly retrieved one.

|              |                                                                                                                                                                                                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                                                                                                                                                                            |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` (execution; `--preview` reports `DEPLOY_PREVIEW_FAILED`), `sf data360 delete`                                                                                                                                                               |
| **Outcome**  | `blocked` on deploy and delete before a write — nothing was changed; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning; `failed` with mutation `unknown` when it appears in the checks after a write |

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
Retrieve: success.
Warning: data-stream:WebOrders_Order_1a2b3c4d: retrieved as-is (verbatim, reason INVALID_STREAM_DOCUMENT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-stream: 1
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the deploy-side report for a stream file that fails these checks.
- [`INVALID_STREAM_NAME`](../data-stream/INVALID_STREAM_NAME.md) — a name in the document is not a valid developer name.
- [`UNSUPPORTED_STREAM_SPEC`](../data-stream/UNSUPPORTED_STREAM_SPEC.md) — the structure is valid but a fixed value is unsupported.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
