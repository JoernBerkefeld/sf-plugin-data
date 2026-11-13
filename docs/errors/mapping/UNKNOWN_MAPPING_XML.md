# `UNKNOWN_MAPPING_XML`

> The mapping's Metadata API XML read at API 65 has elements the plugin does not know, repeats one, or lacks one it needs. Check the mapping in Data Cloud Setup.

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                  |
| **Commands** | None. Only the plugin's internal API 65 mapping evidence reader raises it; no command calls that reader. |
| **Outcome**  | `blocked` — nothing was changed                                                                          |

## What it means

While reading a mapping's Metadata API XML at API 65, the plugin expects an exact set of elements in the header and in each field pair. An element was unknown, repeated or missing, or other content remained.

## Why the plugin stops

The reader only accepts evidence it can fully account for. Guessing how to read an unexpected shape could produce a mapping definition that differs from the one in the org, so it stops instead.

## How to fix

No command reaches this code, so there is nothing to fix in a normal run.

If you see it from your own tooling built on the plugin's internal modules, check the mapping in Data Cloud Setup and use `sf data360 retrieve --metadata mapping:<Name>` instead, which reads mappings at API 68.

## Example output

```text
# No command prints this code. The internal reader reports it as:
UNKNOWN_MAPPING_XML: Mapping evidence acquisition failed.
Hint: The mapping's Metadata API XML read at API 65 has elements the plugin does not know, repeats one, or lacks one it needs. Check the mapping in Data Cloud Setup.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/UNKNOWN_MAPPING_XML.md
```

## Related codes

- [`INVALID_MAPPING_XML`](../mapping/INVALID_MAPPING_XML.md) — the Metadata API XML of a mapping read at API 65 is malformed.
- [`UNSUPPORTED_MAPPING_SEMANTICS`](../mapping/UNSUPPORTED_MAPPING_SEMANTICS.md) — a mapping read at API 65 uses filters or formula sources.
