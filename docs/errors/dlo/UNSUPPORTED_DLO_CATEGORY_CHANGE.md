# `UNSUPPORTED_DLO_CATEGORY_CHANGE`

> The category of an existing DLO cannot be changed. Set category in the file back to the org value, or create the DLO under a new name.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data lake object                |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The DLO already exists in the target org, and `spec.category` in the file differs from its category there (for example `Profile` versus `Engagement`).

## Why the plugin stops

Salesforce fixes the category of a DLO when it is created and rejects an update that tries to change it. The plugin finds this before sending the update, so nothing is written.

## How to fix

1. Retrieve the DLO from the target org to see its category.
2. Set `spec.category` in the file to that value, or
3. If you really need another category, give the DLO a new API name and deploy it as a new object.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dlo:Orders__dll; mutation: not-attempted.
UNSUPPORTED_DLO_CATEGORY_CHANGE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Target lookup or definition admission failed; no write attempted.
Hint: The category of an existing DLO cannot be changed. Set category in the file back to the org value, or create the DLO under a new name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_CATEGORY_CHANGE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`](../dlo/UNSUPPORTED_DLO_EVENT_FIELD_CHANGE.md) — the event date field is fixed in the same way.
- [`UNSUPPORTED_DLO_FIELD_CHANGE`](../dlo/UNSUPPORTED_DLO_FIELD_CHANGE.md) — an existing field differs.
