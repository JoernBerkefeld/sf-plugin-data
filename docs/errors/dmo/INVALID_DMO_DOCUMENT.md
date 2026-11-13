# `INVALID_DMO_DOCUMENT`

> The DMO definition from the org does not fit the plugin file format. Inspect the DMO in the org (name, data space, label, category, fields) and report it if it looks normal.

|              |                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Family**   | Data model object                                                                                                  |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                    |
| **Outcome**  | `blocked` on a read before any write; `failed` with mutation `unknown` when it is the answer to a create or update |

## What it means

The plugin turns every DMO it reads from the org into its portable file format and checks the result:

- `identity.apiName` ends in `__dlm`; `identity.dataSpace` is a non-empty name without leading or trailing spaces or control characters;
- `spec.label` and `spec.category` are non-empty; `spec.description`, when present, is text; `spec.fields` has at least one field;
- no runtime values (such as IDs or status) appear in `spec`.

The definition built from the org's answer broke one of these rules, for example a DMO without a data space name.

A hand-edited `.dmo-meta.json` file that breaks these rules is reported on deploy as `INVALID_SOURCE` instead.

## Why the plugin stops

Every file the plugin writes and every write decision rests on this checked definition. If the org's answer does not fit, saving or comparing it could lose parts of the DMO, so the plugin stops.

## How to fix

1. Read the DMO in the org (`sf api request rest /services/data/v68.0/ssot/data-model-objects/<Name>__dlm`) and compare it with the rules above.
2. If the code came after a deploy write (mutation `unknown`), check the DMO in the org before you deploy again.
3. If the DMO looks normal, report the case with the `--json` output.

## Example output

```text
Retrieve: failed.
dmo:Customer__dlm: INVALID_DMO_DOCUMENT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The DMO definition from the org does not fit the plugin file format. Inspect the DMO in the org (name, data space, label, category, fields) and report it if it looks normal.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/INVALID_DMO_DOCUMENT.md
Downloaded dmo: 0
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the local file of a deploy is invalid.
- [`INVALID_DMO_FIELD`](../dmo/INVALID_DMO_FIELD.md) — one field of the definition is invalid.
- [`INVALID_DLO_DOCUMENT`](../dlo/INVALID_DLO_DOCUMENT.md) — the same check for data lake objects.
