# `MAPPING_DELETE_FAILED`

> The Metadata API did not confirm the destructive deployment that deletes the mapping. Read the problems shown, check whether the mapping still exists, then fix the cause.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Mapping                       |
| **Commands** | `sf data360 delete`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

A mapping is deleted with one Metadata API destructive deployment of the `ObjectSourceTargetMap` component. The deployment did not report success with the mapping as deleted. The message lists the problems Salesforce reported, when it reported any.

## Why the plugin stops

The deployment was sent once and its result is not a confirmed deletion. Sending it again without knowing the state could act on an org that has already changed, so the plugin stops and does not retry.

## How to fix

1. Read the Metadata API problems in the message.
2. Check whether the mapping still exists: `sf data360 retrieve --metadata mapping:<Name>`.
3. Fix the reported cause (for example a dependency or a permission), then run the delete again.

## Example output

```text
Delete: failed.
Failed: mapping:Customer_Home_map; mutation: unknown.
MAPPING_DELETE_FAILED: Salesforce Metadata API did not confirm the destructive deployment: Cannot delete this mapping because it is in use. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The Metadata API did not confirm the destructive deployment that deletes the mapping. Read the problems shown, check whether the mapping still exists, then fix the cause.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DELETE_FAILED.md
```

## Related codes

- [`MAPPING_DELETION_UNCONFIRMED`](../mapping/MAPPING_DELETION_UNCONFIRMED.md) — the mapping was still readable after the deletion.
- [`MAPPING_LAST_MAPPING_DELETE_BLOCKED`](../mapping/MAPPING_LAST_MAPPING_DELETE_BLOCKED.md) — the last mapping of a custom DMO cannot be deleted.
