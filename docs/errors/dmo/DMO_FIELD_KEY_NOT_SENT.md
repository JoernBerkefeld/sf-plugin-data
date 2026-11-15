# `DMO_FIELD_KEY_NOT_SENT`

> Salesforce takes no input for the named DMO field keys, so the file values were not sent and the org keeps its own. Change them in the Data Model UI if needed.

|              |                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                           |
| **Commands** | `sf data360 deploy`                                                                         |
| **Outcome**  | warning — the item stays `created`, `updated` or `unchanged`; the exit status is unaffected |

## What it means

A field in the `.dmo-meta.json` file has a value for a key that reads return but the DMO API does not take as input (`creationType`, `isDistinct`, `usageTag`, `keyQualifierName`), and that value differs from the org. The message names each one as `fields.<field>.<key>`.

A common case is `isDistinct: true` (the "Enable Value Suggestion" setting of the Data Model UI) in a file retrieved from another org: the field is created without it and reads back `false`.

## Why the plugin reports it

The plugin never sends these keys, because Salesforce rejects them as unknown input. The rest of the definition was written and confirmed, so the deploy succeeds; the warning tells you which values in the file the org does not have. A preview reports the same keys for an existing DMO, and a repeat deploy of the file reports the DMO `unchanged` with this warning.

## How to fix

1. If the org value is acceptable, retrieve the DMO with `--overwrite` so the file shows what the org holds; the warning then goes away.
2. If you need the file value, set it in the Data Model UI of the org, then retrieve the DMO to refresh the file.

## Example output

```text
Deploy execution: success. No automatic retry or rollback performed.
created dmo Customer__dlm
DMO_FIELD_KEY_NOT_SENT: Salesforce takes no input for these field keys, so the file's values were not sent and the org keeps its own: fields.Email__c.isDistinct.
Hint: Salesforce takes no input for the named DMO field keys, so the file values were not sent and the org keeps its own. Change them in the Data Model UI if needed.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_KEY_NOT_SENT.md
Deployed: 1 (1 created / 0 updated / 0 failed)
```

## Related codes

- [`DMO_PERSISTENCE_UNCONFIRMED`](../dmo/DMO_PERSISTENCE_UNCONFIRMED.md) — a key that is sent did not read back.
- [`UNSUPPORTED_DMO_FIELD_CHANGE`](../dmo/UNSUPPORTED_DMO_FIELD_CHANGE.md) — a field change the plugin cannot apply.
