# `DELETE_FAILED`

> The delete stopped for a reason without a more specific code. Read the message, check the item outcome and inspect the target before trying again; nothing is retried.

|              |                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                                   |
| **Commands** | `sf data360 delete`                                                                                       |
| **Outcome**  | `blocked` or `failed` — see the item line; when the mutation is `unknown`, the deletion may have happened |

## What it means

`DELETE_FAILED` is the general code of `sf data360 delete`. It appears when a step failed and no family-specific code describes it, for example an unexpected error while reading the target, a data graph deletion that was blocked or failed, or a field-level delete that stopped on an unexpected error.

The message says whether Salesforce rejected a request (with the HTTP status) or whether a check inside the plugin failed.

## Why the plugin stops

The plugin never repeats a delete and never rolls back. When it cannot say what happened, it stops the batch and reports, so a second attempt is a decision you make after looking at the target.

## How to fix

1. Read the item line: `mutation: not-attempted` means nothing was deleted; `mutation: unknown` means the delete may have happened.
2. Check the component in the org, for example with `sf data360 retrieve -m <type>:<ApiName>`.
3. Fix what the message points at (session, permissions, selection) and run the delete again only when the component is still present.

## Example output

```text
Delete: failed.
Failed: data-graph:Customer_Graph; mutation: unknown.
DELETE_FAILED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The delete stopped for a reason without a more specific code. Read the message, check the item outcome and inspect the target before trying again; nothing is retried.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DELETE_FAILED.md
```

## Related codes

- [`DESTRUCTIVE_CONFIRMATION_REQUIRED`](../general/DESTRUCTIVE_CONFIRMATION_REQUIRED.md) — a `--changed-since` delete was refused because `--confirm-delete` was missing.
- [`LOCAL_FILE_REMOVAL_FAILED`](../general/LOCAL_FILE_REMOVAL_FAILED.md) — the org deletion worked but a local file was not removed.
