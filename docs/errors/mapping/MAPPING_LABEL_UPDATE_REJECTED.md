# `MAPPING_LABEL_UPDATE_REJECTED`

> Salesforce refused the Metadata API update of the mapping's label, so the label was not changed. Read Salesforce's text in the message, correct spec.label, then rerun.

|              |                                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                   |
| **Commands** | `sf data360 deploy`                                                                                       |
| **Outcome**  | `failed` — mutation `rejected` when the label was the only change; `unknown` after a create or pair write |

## What it means

The mapping file states a `spec.label` that differs from the org's label. The Connect mapping routes cannot change a label, so deploy sends one Metadata API `updateMetadata` of the `ObjectSourceTargetMap` record after the pairs are settled: the new `masterLabel` with every pair the mapping currently has and no other, because a pair left out of the update is kept and a pair in it is added. Salesforce answered with an error (success `false`, or a client SOAP fault such as `soapenv:Client` or `sf:INVALID_…`). The message shows its status code and, when it can be shown, its text.

A server fault (`soapenv:Server`, `sf:UNKNOWN_EXCEPTION`) is not a refusal: the update may have been applied, so it is reported as [`MAPPING_REQUEST_UNCONFIRMED`](../mapping/MAPPING_REQUEST_UNCONFIRMED.md) and not sent again. A used-up API request limit (`sf:REQUEST_LIMIT_EXCEEDED`) is not a refusal of the label either: it is reported as `MAPPING_REQUEST_UNCONFIRMED` with the advice to rerun once the limit has reset, without changing the file.

When the label was the only difference, nothing was written and the mutation is `rejected`. When the deploy created the mapping or changed its pairs first, those writes stay; only the label is missing, and the mutation is `unknown`.

## Why the plugin stops

The plugin sends the label as written and Salesforce decides. It does not retry and does not roll back the pair writes before it.

## How to fix

1. Read Salesforce's answer in the message.
2. Correct `spec.label` in the mapping file, or remove the key to leave the org's label alone.
3. Run the deploy again with `--preview`, then without it.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: mapping:Customer_Home_map; mutation: rejected.
MAPPING_LABEL_UPDATE_REJECTED: Salesforce refused the Metadata API update of the ObjectSourceTargetMap Customer_Home_map_Customer_1794467679481: FIELD_INTEGRITY_EXCEPTION. The label was not changed. Salesforce rejected the write and nothing was written for this item; correct the input before another attempt.
Hint: Salesforce refused the Metadata API update of the mapping's label, so the label was not changed. Read Salesforce's text in the message, correct spec.label, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_LABEL_UPDATE_REJECTED.md
```

## Related codes

- [`MAPPING_LABEL_READ_FAILED`](../mapping/MAPPING_LABEL_READ_FAILED.md) — the read before the label update failed.
- [`MAPPING_PERSISTENCE_UNCONFIRMED`](../mapping/MAPPING_PERSISTENCE_UNCONFIRMED.md) — the label did not read back after the update.
