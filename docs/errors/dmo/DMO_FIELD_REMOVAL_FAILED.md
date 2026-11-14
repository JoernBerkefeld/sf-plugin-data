# `DMO_FIELD_REMOVAL_FAILED`

> The Metadata API did not confirm the field removal. Read the DMO and its mappings in the org to see which fields remain before another attempt.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | Data model object                                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete`                 |
| **Outcome**  | `failed` — mutation `unknown`; the removal was sent once |

## What it means

Custom DMO fields are removed with one Metadata API destructive deployment. Its result did not report every named field as deleted: the deployment failed, ended in another state, or its answer could not be read. The message includes the problem text Salesforce returned, when there is one.

On deploy, a PATCH of the same DMO may already have been applied before the removal.

## Why the plugin stops

The plugin sends the removal once and never retries it. Without a confirmed result it cannot say which fields are gone, so it stops and asks you to check.

## How to fix

1. Read the problem text in the message (for example a field still referenced elsewhere).
2. Read the DMO and its mappings in the org to see which fields are still there.
3. Resolve the cause, then rerun `sf data360 delete -m dmo:<Name>__dlm --field ...` or the deploy with `--allow-field-removal`.

## Example output

```text
Delete: failed.
Failed: dmo:Customer__dlm field Nickname__c; mutation: unknown.
DMO_FIELD_REMOVAL_FAILED: Salesforce Metadata API did not confirm the destructive deployment: Cannot delete this field because it is referenced. The Metadata API destructive change for Nickname__c was sent once and is not confirmed; read the DMO and its mappings before another attempt. No local file was refreshed. No retry or rollback.
Hint: The Metadata API did not confirm the field removal. Read the DMO and its mappings in the org to see which fields remain before another attempt.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_FIELD_REMOVAL_FAILED.md
```

## Related codes

- [`DMO_FIELD_REMOVAL_SIDE_EFFECT`](../dmo/DMO_FIELD_REMOVAL_SIDE_EFFECT.md) — the removal worked but changed more than planned.
- [`DMO_PERSISTENCE_UNCONFIRMED`](../dmo/DMO_PERSISTENCE_UNCONFIRMED.md) — the removal was accepted but the fields still read back.
