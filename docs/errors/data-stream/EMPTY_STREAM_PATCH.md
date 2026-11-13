# `EMPTY_STREAM_PATCH`

> The plugin tried to build a stream update with no mapping to add. Nothing was sent; rerun the deploy, and report it if it happens again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data stream                     |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

A stream update only adds new field mappings. The plugin compares `spec.additiveFieldMappings` with the target and sends an update only for the mappings that are missing. When none are missing the deploy reports `unchanged` without a write.

This code means the update body was about to be built with no mapping in it. The plugin's own checks normally prevent that, so it points to an internal inconsistency rather than a problem in your file.

## Why the plugin stops

An update with no mappings would be a write with no purpose, and the plugin cannot know what Salesforce would do with it. It stops before sending anything.

## How to fix

1. Rerun the deploy with `--preview` to see the planned outcome.
2. If the code appears again, report it with the stream file (without secrets) and the command you ran.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: data-stream:WebOrders_Order_1a2b3c4d; mutation: not-attempted.
EMPTY_STREAM_PATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The plugin tried to build a stream update with no mapping to add. Nothing was sent; rerun the deploy, and report it if it happens again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/EMPTY_STREAM_PATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`STREAM_MAPPING_CONFLICT`](../data-stream/STREAM_MAPPING_CONFLICT.md) — a requested mapping clashes with an existing one.
- [`CREATE_ADDITIONS_UNSUPPORTED`](../data-stream/CREATE_ADDITIONS_UNSUPPORTED.md) — the create counterpart: a new stream cannot carry extra mappings.
