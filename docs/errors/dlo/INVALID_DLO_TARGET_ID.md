# `INVALID_DLO_TARGET_ID`

> The org returned a DLO record ID in an unexpected form, so the write or delete was not sent. Inspect the DLO in the org and rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data lake object                         |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

An update or delete of a DLO is sent to its record ID, which the plugin reads from the org just before the write. The ID must be 18 letters and digits. The ID it was about to use did not have that form.

## Why the plugin stops

The ID becomes part of the request URL of a write. Sending a malformed ID could hit a different resource, so the plugin refuses it.

## How to fix

1. Read the DLO in the org and check its `id`.
2. Rerun the command. If the problem stays, report it with the output of `--json`.

## Example output

```text
Delete: blocked.
Blocked: dlo:Orders__dll; mutation: not-attempted.
INVALID_DLO_TARGET_ID: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The org returned a DLO record ID in an unexpected form, so the write or delete was not sent. Inspect the DLO in the org and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/INVALID_DLO_TARGET_ID.md
```

## Related codes

- [`DLO_TARGET_IDENTITY_MISMATCH`](../dlo/DLO_TARGET_IDENTITY_MISMATCH.md) — the lookup returned another DLO or no usable ID.
