# `AMBIGUOUS_MAPPING_PAIRS`

> A mapping read at API 65 has a malformed or repeated field pair, so its pairs cannot be told apart. Check the mapping's field pairs in Data Cloud Setup.

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                  |
| **Commands** | None. Only the plugin's internal API 65 mapping evidence reader raises it; no command calls that reader. |
| **Outcome**  | `blocked` — nothing was changed                                                                          |

## What it means

While reading a mapping at API 65, the plugin found a field pair whose name, source field or target field is malformed, or a pair name, source field or target field that appears in more than one pair. Each pair must be unique on all three.

## Why the plugin stops

The reader only accepts evidence it can fully account for. Guessing how to read an unexpected shape could produce a mapping definition that differs from the one in the org, so it stops instead.

## How to fix

No command reaches this code, so there is nothing to fix in a normal run.

If you see it from your own tooling built on the plugin's internal modules, check the mapping in Data Cloud Setup and use `sf data360 retrieve --metadata mapping:<Name>` instead, which reads mappings at API 68.

## Example output

```text
# No command prints this code. The internal reader reports it as:
AMBIGUOUS_MAPPING_PAIRS: Mapping evidence acquisition failed.
Hint: A mapping read at API 65 has a malformed or repeated field pair, so its pairs cannot be told apart. Check the mapping's field pairs in Data Cloud Setup.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/AMBIGUOUS_MAPPING_PAIRS.md
```

## Related codes

- [`MAPPING_PAIR_MISMATCH`](../mapping/MAPPING_PAIR_MISMATCH.md) — the XML and runtime pairs of a mapping read at API 65 disagree.
- [`INVALID_MAPPING_RUNTIME`](../mapping/INVALID_MAPPING_RUNTIME.md) — a mapping read at API 65 has an unexpected status, name or pair count.
