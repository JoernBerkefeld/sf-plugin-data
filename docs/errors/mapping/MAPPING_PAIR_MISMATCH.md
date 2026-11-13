# `MAPPING_PAIR_MISMATCH`

> A mapping read at API 65 has Metadata API XML whose pairs or objects do not match its runtime detail. Check the mapping in Data Cloud Setup.

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                  |
| **Commands** | None. Only the plugin's internal API 65 mapping evidence reader raises it; no command calls that reader. |
| **Outcome**  | `blocked` — nothing was changed                                                                          |

## What it means

While reading a mapping at API 65, the plugin compares its Metadata API XML with its runtime detail. An XML pair had no matching runtime pair, matched one twice, or the XML header names other objects, is not Custom, has a missing or too long label, or lists no pairs.

## Why the plugin stops

The reader only accepts evidence it can fully account for. Guessing how to read an unexpected shape could produce a mapping definition that differs from the one in the org, so it stops instead.

## How to fix

No command reaches this code, so there is nothing to fix in a normal run.

If you see it from your own tooling built on the plugin's internal modules, check the mapping in Data Cloud Setup and use `sf data360 retrieve --metadata mapping:<Name>` instead, which reads mappings at API 68.

## Example output

```text
# No command prints this code. The internal reader reports it as:
MAPPING_PAIR_MISMATCH: Mapping evidence acquisition failed.
Hint: A mapping read at API 65 has Metadata API XML whose pairs or objects do not match its runtime detail. Check the mapping in Data Cloud Setup.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_PAIR_MISMATCH.md
```

## Related codes

- [`AMBIGUOUS_MAPPING_PAIRS`](../mapping/AMBIGUOUS_MAPPING_PAIRS.md) — repeated or malformed pairs in a mapping read at API 65.
- [`INVALID_MAPPING_XML`](../mapping/INVALID_MAPPING_XML.md) — the Metadata API XML of a mapping read at API 65 is malformed.
