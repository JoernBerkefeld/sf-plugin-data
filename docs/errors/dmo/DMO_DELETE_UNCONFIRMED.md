# `DMO_DELETE_UNCONFIRMED`

> The DMO DELETE got an unexpected answer, so its outcome is unknown. Read the DMO in the org before you run the delete again.

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| **Family**   | Data model object                                       |
| **Commands** | `sf data360 delete`                                     |
| **Outcome**  | `failed` — mutation `unknown`; the DELETE was sent once |

## What it means

Salesforce confirms a successful DMO DELETE with an empty "no content" answer. The plugin's one DELETE request got something else: another success status, or a body where none was expected. The request reached Salesforce, so the DMO may or may not be deleted.

## Why the plugin stops

An answer the plugin does not recognise proves neither deletion nor its absence. Reporting it as deleted could lead you to remove files for an object that still exists; retrying could repeat the write. The plugin stops and keeps the local file.

## How to fix

1. Read the DMO in the org by its exact API name.
2. If it is gone, remove the local file yourself if you no longer need it.
3. If it still exists, run the delete again once you know why the first one did not finish.

## Example output

```text
Delete: failed.
Failed: dmo:Customer__dlm; mutation: unknown.
DMO_DELETE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The DMO DELETE got an unexpected answer, so its outcome is unknown. Read the DMO in the org before you run the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_DELETE_UNCONFIRMED.md
```

## Related codes

- [`DMO_DELETE_NOT_CONFIRMED`](../dmo/DMO_DELETE_NOT_CONFIRMED.md) — the DELETE was accepted but the follow-up read did not confirm it.
- [`DMO_REQUEST_UNCONFIRMED`](../dmo/DMO_REQUEST_UNCONFIRMED.md) — no readable answer at all.
- [`DLO_DELETE_UNCONFIRMED`](../dlo/DLO_DELETE_UNCONFIRMED.md) — the same result for data lake objects.
