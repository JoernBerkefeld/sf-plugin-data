# `INVALID_MAPPING_RUNTIME`

> A mapping read at API 65 is not ACTIVE, has an unexpected name or object binding, or has no pairs or too many. Check the mapping in Data Cloud Setup.

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                  |
| **Commands** | None. Only the plugin's internal API 65 mapping evidence reader raises it; no command calls that reader. |
| **Outcome**  | `blocked` — nothing was changed                                                                          |

## What it means

While reading a mapping at API 65, the plugin found that its name differs from the one requested, its status is not ACTIVE, its source or target object name is not a `Name__dll` or `Name__dlm` name, or its pair list is empty or longer than 1000.

## Why the plugin stops

The reader only accepts evidence it can fully account for. Guessing how to read an unexpected shape could produce a mapping definition that differs from the one in the org, so it stops instead.

## How to fix

No command reaches this code, so there is nothing to fix in a normal run.

If you see it from your own tooling built on the plugin's internal modules, check the mapping in Data Cloud Setup and use `sf data360 retrieve --metadata mapping:<Name>` instead, which reads mappings at API 68.

## Example output

```text
# No command prints this code. The internal reader reports it as:
INVALID_MAPPING_RUNTIME: Mapping evidence acquisition failed.
Hint: A mapping read at API 65 is not ACTIVE, has an unexpected name or object binding, or has no pairs or too many. Check the mapping in Data Cloud Setup.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_RUNTIME.md
```

## Related codes

- [`INVALID_MAPPING_CONFIGURATION`](../mapping/INVALID_MAPPING_CONFIGURATION.md) — a mapping read at API 65 is not an object.
- [`AMBIGUOUS_MAPPING_PAIRS`](../mapping/AMBIGUOUS_MAPPING_PAIRS.md) — repeated or malformed pairs in a mapping read at API 65.
