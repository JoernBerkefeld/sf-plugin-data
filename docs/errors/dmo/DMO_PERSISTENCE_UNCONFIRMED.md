# `DMO_PERSISTENCE_UNCONFIRMED`

> The DMO change was sent, but reading it back did not show it. Read the DMO in the org before another attempt; the change may still have taken effect.

|              |                                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                   |
| **Commands** | `sf data360 deploy`, `sf data360 delete`                                            |
| **Outcome**  | `failed` — mutation `unknown` on deploy; `deletion-unconfirmed` on `delete --field` |

## What it means

After a create, update or field removal, the plugin reads the DMO back a few times, a few seconds apart, and compares it with what it asked for. None of the reads matched. The message names the first difference. Typical cases:

- a label, description or field edit that is not visible yet;
- a removed field that still reads back;
- on a deploy that also removes fields, the PATCH before the removal that did not become visible in time, in which case the removal was not sent.

## Why the plugin stops

The plugin reports a write as done only when an independent read confirms it. It does not send the write again, because a second write could stack on top of one that is just slow to show.

## How to fix

1. Wait a minute, then read the DMO in the org.
2. If the change is there, nothing more is needed; retrieve the DMO to refresh your file.
3. If it is not, check the message for the field or property that differs, then rerun the deploy.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: dmo:Customer__dlm; mutation: unknown.
DMO_PERSISTENCE_UNCONFIRMED: Plugin verification failed during post-write requested definition readback for "Customer__dlm": state.spec.label: expected [redacted]; observed [redacted]. Write outcome is unknown; inspect target before another attempt. No automatic retry.
Hint: The DMO change was sent, but reading it back did not show it. Read the DMO in the org before another attempt; the change may still have taken effect.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_PERSISTENCE_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`DMO_FIELD_REMOVAL_FAILED`](../dmo/DMO_FIELD_REMOVAL_FAILED.md) — the field removal itself was not confirmed.
- [`DMO_REQUEST_UNCONFIRMED`](../dmo/DMO_REQUEST_UNCONFIRMED.md) — the write request did not end clearly.
