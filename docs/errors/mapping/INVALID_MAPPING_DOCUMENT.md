# `INVALID_MAPPING_DOCUMENT`

> The mapping file, or the mapping read from the org, does not match the mapping format. Check schemaVersion, kind, identity, the __dll and __dlm names and that fieldMappings is not empty.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Mapping                                                         |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

A mapping definition must have exactly the keys `schemaVersion` (1), `kind` (`mapping`), `identity` and `spec`:

- `identity` has exactly `apiName` (a letter, then letters, digits or underscores) and a non-blank `dataSpace` without surrounding spaces or control characters.
- `spec` has exactly `sourceEntityDeveloperName` (`Name__dll`), `targetEntityDeveloperName` (`Name__dlm`) and a non-empty `fieldMappings` list.

The mapping file you deploy, or the mapping Salesforce returned, broke one of these rules.

## Why the plugin stops

The plugin only deploys or saves what it fully understands. A file with unknown or missing keys could silently drop information or change a mapping in a way you did not write.

## How to fix

1. Compare the file under `data360/mapping/` with the format above; remove extra keys and add missing ones.
2. If you wrote the file by hand, retrieve a mapping with `sf data360 retrieve --metadata mapping:<Name>` and use it as a template.
3. If the error comes from a retrieve, rerun it; if it repeats, the org returned an unexpected mapping shape.

## Example output

```text
Deploy preview: blocked (INVALID_MAPPING_DOCUMENT). No deployment executed.
INVALID_MAPPING_DOCUMENT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The mapping file, or the mapping read from the org, does not match the mapping format. Check schemaVersion, kind, identity, the __dll and __dlm names and that fieldMappings is not empty.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_DOCUMENT.md
```

## Related codes

- [`INVALID_MAPPING_FIELD`](../mapping/INVALID_MAPPING_FIELD.md) — a single field pair breaks the file format.
- [`MAPPING_DATASPACE_MISMATCH`](../mapping/MAPPING_DATASPACE_MISMATCH.md) — the mapping file names another data space than the command.
