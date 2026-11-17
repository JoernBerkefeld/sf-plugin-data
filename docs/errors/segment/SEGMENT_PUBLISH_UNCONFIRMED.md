# `SEGMENT_PUBLISH_UNCONFIRMED`

> The publish was sent, but its answer or the status after it could not be read, so the publish may be running. Read the segment before publishing again; nothing was resent.

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Family**   | Segment                                                     |
| **Commands** | `sf data360 publish`                                        |
| **Outcome**  | `failed` — mutation `unknown`: the publish may have started |

## What it means

The publish request was sent, but it ended without a usable answer (network error, timeout, 429, 5xx, or no `success: true`), or a status read after it failed.

## Why the plugin stops

A publish is a write: the plugin never resends it when it cannot tell whether Salesforce received it, so it cannot start two jobs.

## How to fix

1. Read the segment (in Data Cloud or with `sf data360 retrieve -m segment:<Name> --output-dir <scratch>`) and check its publish status and last publish time.
2. Publish again only if no publish is running and none finished after this run started.

## Example output

```text
Publish: failed.
failed: Example_Segment; mutation: unknown.
SEGMENT_PUBLISH_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The publish may have started. Read the segment before publishing again; nothing was resent.
Hint: The publish was sent, but its answer or the status after it could not be read, so the publish may be running. Read the segment before publishing again; nothing was resent.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PUBLISH_UNCONFIRMED.md
```

## Related codes

- [`SEGMENT_PUBLISH_REJECTED`](../segment/SEGMENT_PUBLISH_REJECTED.md) — Salesforce refused the publish.
