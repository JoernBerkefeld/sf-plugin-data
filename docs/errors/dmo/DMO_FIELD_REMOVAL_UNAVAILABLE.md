# `DMO_FIELD_REMOVAL_UNAVAILABLE`

> The plugin had no Metadata API route for the planned field removal, so nothing was written. Rerun the command; if it persists, report it with the --json output.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Data model object                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

A field removal was planned, but the client the plugin built for this request has no way to send the Metadata API change that removes fields. The plugin checks this before any write.

## Why the plugin stops

A deploy that sends its PATCH and then cannot remove the fields would leave the DMO half-updated. Stopping before the first write keeps the org unchanged.

## How to fix

1. Rerun the command.
2. If it happens again, report it with the `--json` output; it points to a problem in the plugin rather than in your files.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:Customer__dlm; mutation: not-attempted.
DMO_FIELD_REMOVAL_UNAVAILABLE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The plugin had no Metadata API route for the planned field removal, so nothing was written. Rerun the command; if it persists, report it with the --json output.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_REMOVAL_UNAVAILABLE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`DMO_FIELD_REMOVAL_FAILED`](../dmo/DMO_FIELD_REMOVAL_FAILED.md) — the removal was sent but not confirmed.
