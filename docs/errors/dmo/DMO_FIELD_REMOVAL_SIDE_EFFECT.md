# `DMO_FIELD_REMOVAL_SIDE_EFFECT`

> Salesforce changed more than the removed fields and their mapping pairs. Nothing was rolled back; read the DMO and its mappings before any further action.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data model object                                               |
| **Commands** | `sf data360 deploy`, `sf data360 delete`                        |
| **Outcome**  | `failed` — the removal was sent; its effects are not as planned |

## What it means

After the field removal the plugin reads the DMO and its mappings until the fields are gone. It expects exactly this: the named fields absent, exactly their mapping pairs dropped, and every other field, DMO property, mapping, pair and mapping status as before. One of the reads showed a different change. The message names which part differed.

## Why the plugin stops

The plugin promised to change only the named fields and their pairs. When the org shows more, it cannot treat the result as a success, and it does not try to undo changes it did not make.

## How to fix

1. Read the DMO and every mapping that targets it in the org.
2. Compare with your project files or a fresh retrieve into a scratch folder.
3. Repair any unintended change by hand or by deploying the right files.
4. Retrieve the DMO and mappings again to bring the project up to date.

## Example output

```text
Delete: failed.
Unconfirmed: dmo:Customer__dlm field Nickname__c; mutation: acknowledged.
DMO_FIELD_REMOVAL_SIDE_EFFECT: Plugin verification failed during field removal readback of the mapping pairs for "Customer__dlm": state: protected content differs (values redacted; diagnostic traversal limit or admitted ordering difference). Salesforce changed more than the removed fields and their mapping pairs. Nothing was retried or rolled back; read the DMO and its mappings before any further action. The Metadata API destructive change for Nickname__c was acknowledged, but the result was not confirmed: the field(s) gone, exactly their mapping pairs dropped, everything else unchanged. Read the DMO and its mappings before another attempt. No local file was refreshed. No retry or rollback.
Hint: Salesforce changed more than the removed fields and their mapping pairs. Nothing was rolled back; read the DMO and its mappings before any further action.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_REMOVAL_SIDE_EFFECT.md
```

## Related codes

- [`DMO_FIELD_REMOVAL_FAILED`](../dmo/DMO_FIELD_REMOVAL_FAILED.md) — the removal itself was not confirmed.
- [`MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED`](../mapping/MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED.md) — the dropped pairs never disappeared.
