# `INVALID_DLO_DOCUMENT`

> The DLO definition from the org does not fit the plugin file format. Inspect the DLO in the org (label, data space, event field) and report it if it looks normal.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data lake object                                                                                                   |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                    |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update |

## What it means

The plugin turns every DLO it reads from the org into its portable file format and checks the result:

- `identity.apiName` ends in `__dll`; `identity.dataSpace` is a non-empty name without leading or trailing spaces or control characters;
- `spec.label` is 1–40 characters; `spec.category` is set; `spec.fields` has at least one field;
- `spec.eventDateTimeFieldName`, when present, names one of the listed fields exactly.

The definition built from the org's answer broke one of these rules, for example a label longer than 40 characters or an event field that is not in the field list.

A hand-edited `.dlo-meta.json` file that breaks these rules is reported on deploy as `INVALID_SOURCE` instead.

## Why the plugin stops

The plugin bases every file it writes and every write decision on this checked definition. If the org's answer does not fit it, saving or comparing it could lose or misread parts of the DLO, so the plugin stops.

## How to fix

1. Read the DLO in the org (`sf api request rest /services/data/v68.0/ssot/data-lake-objects/<Name>__dll`) and compare it with the rules above.
2. If the label is longer than 40 characters, shorten it in Data Cloud setup.
3. If the code came after a deploy write (mutation `unknown`), check the DLO in the org before you deploy again.
4. If the DLO looks normal, report the case with the `--json` output.

## Example output

```text
Retrieve: failed.
dlo:Orders__dll: INVALID_DLO_DOCUMENT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The DLO definition from the org does not fit the plugin file format. Inspect the DLO in the org (label, data space, event field) and report it if it looks normal.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/INVALID_DLO_DOCUMENT.md
Downloaded dlo: 0
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the local file of a deploy is invalid.
- [`INVALID_DLO_FIELD`](../dlo/INVALID_DLO_FIELD.md) — one field of the definition is invalid.
- [`INVALID_DLO_PRIMARY_KEY`](../dlo/INVALID_DLO_PRIMARY_KEY.md) — the number of primary-key fields is wrong.
