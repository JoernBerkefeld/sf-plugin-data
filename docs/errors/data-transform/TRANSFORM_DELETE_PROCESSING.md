# `TRANSFORM_DELETE_PROCESSING`

> The data transform is still PROCESSING, so the delete was not sent. Nothing was changed; wait until Data Cloud shows the transform ACTIVE, then rerun the delete.

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| **Family**   | Data transform                                         |
| **Commands** | `sf data360 delete`                                    |
| **Outcome**  | `blocked` — mutation `not-attempted`, nothing was sent |

## What it means

Before the DELETE, the plugin reads the transform from the org. Its `status` was `PROCESSING`: Data Cloud is still setting it up or running it. In a live check (API 68) Salesforce answered a DELETE sent in that state, but the transform stayed, so the result could only be reported as unconfirmed. A `--preview` reports the same refusal.

## Why the plugin stops

A DELETE sent while the transform is processing does not remove it, and its result cannot be confirmed. Stopping before the DELETE leaves the org unchanged and the outcome clear.

## How to fix

1. Open Data Cloud and wait until the transform shows `ACTIVE` (or another state than processing).
2. Rerun the delete.

## Example output

```text
Delete: blocked.
Blocked: data-transform:Orders_Copy; mutation: not-attempted.
TRANSFORM_DELETE_PROCESSING: Data Cloud is still processing the data transform (status PROCESSING), so the DELETE was not sent and nothing was changed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The data transform is still PROCESSING, so the delete was not sent. Nothing was changed; wait until Data Cloud shows the transform ACTIVE, then rerun the delete.
```

## Related codes

- [`TRANSFORM_DELETE_UNCONFIRMED`](../data-transform/TRANSFORM_DELETE_UNCONFIRMED.md) — the DELETE was sent but its result could not be confirmed.
- [`TRANSFORM_SERVER_PROCESSING`](../data-transform/TRANSFORM_SERVER_PROCESSING.md) — a deploy wrote the transform while Data Cloud was still processing it.
