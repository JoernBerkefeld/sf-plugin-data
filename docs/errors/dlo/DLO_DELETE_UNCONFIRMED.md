# `DLO_DELETE_UNCONFIRMED`

> The DLO DELETE got an unexpected answer, so its outcome is unknown. Read the DLO in the org before you run the delete again.

|              |                                                         |
| ------------ | ------------------------------------------------------- |
| **Family**   | Data lake object                                        |
| **Commands** | `sf data360 delete`                                     |
| **Outcome**  | `failed` — mutation `unknown`; the DELETE was sent once |

## What it means

Salesforce confirms a successful DLO DELETE with an empty "no content" answer. The plugin received something else for its one DELETE request: another success status, or a body where none was expected.

The request did reach Salesforce, so the DLO may or may not be deleted.

## Why the plugin stops

An answer the plugin does not recognise is not proof of deletion, and it is not proof that nothing happened either. Reporting it as deleted could make you remove files for an object that still exists; retrying could repeat a write. The plugin stops and leaves the local file in place.

## How to fix

1. Read the DLO in the org by its exact API name.
2. If it is gone, remove the local file yourself if you no longer need it.
3. If it still exists, run the delete again once you know why the first one did not finish.

## Example output

```text
Delete: failed.
Failed: dlo:Orders__dll; mutation: unknown.
DLO_DELETE_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The DLO DELETE got an unexpected answer, so its outcome is unknown. Read the DLO in the org before you run the delete again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DELETE_UNCONFIRMED.md
```

## Related codes

- [`DLO_DELETE_NOT_CONFIRMED`](../dlo/DLO_DELETE_NOT_CONFIRMED.md) — the DELETE was accepted but the follow-up read did not confirm it.
- [`DLO_REQUEST_UNCONFIRMED`](../dlo/DLO_REQUEST_UNCONFIRMED.md) — no readable answer at all.
- [`DMO_DELETE_UNCONFIRMED`](../dmo/DMO_DELETE_UNCONFIRMED.md) — the same result for data model objects.
