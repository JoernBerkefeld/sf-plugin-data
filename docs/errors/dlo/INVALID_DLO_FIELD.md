# `INVALID_DLO_FIELD`

> A field of the DLO read from the org does not fit the plugin file format. Inspect the field names and types of the DLO in the org.

|              |                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                                                                                                                                                                                        |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                                                                                                                                         |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update; on retrieve, an object read from the org that fails this check is written as-is (verbatim) with this code as reason, with a warning |

## What it means

Each field of a DLO definition must have:

- `name`: starts with a letter, only letters, digits and underscores, ends in `__c`, unique (ignoring case);
- `label`: a non-empty string;
- `dataType`: a non-empty string;
- `isPrimaryKey`: `true` or `false`.

Runtime values (`id`, `recordId`, `createdDate`, `lastModifiedDate`) are dropped when the plugin reads a DLO. A field in the org's answer still broke one of the rules, for example a name with another suffix or a missing data type.

A hand-edited `.dlo-meta.json` file with an invalid field is reported on deploy as `INVALID_SOURCE` instead.

## Why the plugin stops

The plugin matches fields by name between the file and the org and sends new fields to Salesforce. A field it cannot identify reliably cannot be saved or compared, so it stops.

## How to fix

1. Read the DLO in the org and look at its field list.
2. Check for a field whose name does not end in `__c`, two names that differ only in case, or a field without a label or data type.
3. If the DLO looks normal, report the case with the `--json` output.

## Example output

```text
Retrieve: success.
Warning: dlo:Orders__dll: retrieved as-is (verbatim, reason INVALID_DLO_FIELD) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded dlo: 1
```

## Related codes

- [`INVALID_DLO_DOCUMENT`](../dlo/INVALID_DLO_DOCUMENT.md) — the definition around the fields is invalid.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the local file of a deploy is invalid.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named as-is file.
