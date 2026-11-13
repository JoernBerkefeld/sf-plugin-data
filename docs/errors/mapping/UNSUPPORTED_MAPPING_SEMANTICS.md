# `UNSUPPORTED_MAPPING_SEMANTICS`

> A mapping read at API 65 uses pair options the plugin does not handle, such as filters or formula sources. Check the mapping in Data Cloud Setup.

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                  |
| **Commands** | None. Only the plugin's internal API 65 mapping evidence reader raises it; no command calls that reader. |
| **Outcome**  | `blocked` — nothing was changed                                                                          |

## What it means

While reading a mapping's Metadata API XML at API 65, a field pair had a creation type other than Custom or System, a filter applied, a filter operation other than Equal, or a formula source.

## Why the plugin stops

The reader only accepts evidence it can fully account for. Guessing how to read an unexpected shape could produce a mapping definition that differs from the one in the org, so it stops instead.

## How to fix

No command reaches this code, so there is nothing to fix in a normal run.

If you see it from your own tooling built on the plugin's internal modules, check the mapping in Data Cloud Setup and use `sf data360 retrieve --metadata mapping:<Name>` instead, which reads mappings at API 68.

## Example output

```text
# No command prints this code. The internal reader reports it as:
UNSUPPORTED_MAPPING_SEMANTICS: Mapping evidence acquisition failed.
Hint: A mapping read at API 65 uses pair options the plugin does not handle, such as filters or formula sources. Check the mapping in Data Cloud Setup.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/UNSUPPORTED_MAPPING_SEMANTICS.md
```

## Related codes

- [`UNKNOWN_MAPPING_XML`](../mapping/UNKNOWN_MAPPING_XML.md) — the XML of a mapping read at API 65 has unknown or missing elements.
- [`MAPPING_PAIR_MISMATCH`](../mapping/MAPPING_PAIR_MISMATCH.md) — the XML and runtime pairs of a mapping read at API 65 disagree.
