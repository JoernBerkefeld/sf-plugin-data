# `INVALID_MAPPING_BINDING`

> A mapping lookup was asked for a DMO or DLO name that is not a valid Name__dlm or Name__dll API name. Check the source and target object names of the mapping.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Mapping                                                         |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

Mappings are listed per target DMO, optionally narrowed to one source DLO. The name passed to that lookup did not have the shape of a DMO API name (`Name__dlm`) or a DLO API name (`Name__dll`), so no request was sent.

## Why the plugin stops

The names become part of the request to Salesforce. Sending a name the plugin has not validated could read the wrong objects or build an unsafe request.

## How to fix

1. Check `sourceEntityDeveloperName` (must end in `__dll`) and `targetEntityDeveloperName` (must end in `__dlm`) in the mapping file.
2. If you selected a DMO by name, check that it is a valid `Name__dlm` API name.
3. Rerun the command.

## Example output

```text
Deploy preview: blocked (INVALID_MAPPING_BINDING). No deployment executed.
INVALID_MAPPING_BINDING: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: A mapping lookup was asked for a DMO or DLO name that is not a valid Name__dlm or Name__dll API name. Check the source and target object names of the mapping.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_BINDING.md
```

## Related codes

- [`INVALID_MAPPING_DOCUMENT`](../mapping/INVALID_MAPPING_DOCUMENT.md) — the whole mapping definition breaks the file format.
- [`INVALID_MAPPING_NAME`](../mapping/INVALID_MAPPING_NAME.md) — the mapping name itself is malformed.
