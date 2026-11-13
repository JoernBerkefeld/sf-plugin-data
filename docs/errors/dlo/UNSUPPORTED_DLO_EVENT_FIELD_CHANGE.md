# `UNSUPPORTED_DLO_EVENT_FIELD_CHANGE`

> The event date field of an existing DLO cannot be changed. Set eventDateTimeFieldName back to the org value, or leave it out of the file.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data lake object                |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Engagement data lake objects name one date-time field that dates each record (`spec.eventDateTimeFieldName`). The file names a different field than the DLO in the org. The message shows both values.

## Why the plugin stops

Salesforce sets the event field when the DLO is created and rejects updates that try to change it. The plugin stops before sending such an update.

## How to fix

1. Set `spec.eventDateTimeFieldName` to the value the message reports for the org, or remove the key; a file without it keeps the org's event field.
2. If you need another event field, create the DLO under a new API name.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dlo:Orders__dll; mutation: not-attempted.
UNSUPPORTED_DLO_EVENT_FIELD_CHANGE: Plugin verification failed during event field preservation for "Orders__dll": spec.eventDateTimeFieldName: expected [redacted]; observed [redacted]. The event field of a data lake object is set on create and cannot be changed. Target lookup or definition admission failed; no write attempted.
Hint: The event date field of an existing DLO cannot be changed. Set eventDateTimeFieldName back to the org value, or leave it out of the file.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_EVENT_FIELD_CHANGE.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`UNSUPPORTED_DLO_CATEGORY_CHANGE`](../dlo/UNSUPPORTED_DLO_CATEGORY_CHANGE.md) — the category is fixed in the same way.
- [`INVALID_DLO_DOCUMENT`](../dlo/INVALID_DLO_DOCUMENT.md) — the event field does not name a listed field.
