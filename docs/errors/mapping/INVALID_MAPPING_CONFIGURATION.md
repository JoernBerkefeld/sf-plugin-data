# `INVALID_MAPPING_CONFIGURATION`

> A mapping read at API 65 was not a single object where one was expected. Check the mapping in Data Cloud Setup and read it with sf data360 retrieve instead.

|              |                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                  |
| **Commands** | None. Only the plugin's internal API 65 mapping evidence reader raises it; no command calls that reader. |
| **Outcome**  | `blocked` — nothing was changed                                                                          |

## What it means

While reading a mapping at API 65, the plugin expected an object (the mapping or one of its pairs) and received something else, such as a list, a plain value or nothing.

## Why the plugin stops

The reader only accepts evidence it can fully account for. Guessing how to read an unexpected shape could produce a mapping definition that differs from the one in the org, so it stops instead.

## How to fix

No command reaches this code, so there is nothing to fix in a normal run.

If you see it from your own tooling built on the plugin's internal modules, check the mapping in Data Cloud Setup and use `sf data360 retrieve --metadata mapping:<Name>` instead, which reads mappings at API 68.

## Example output

```text
# No command prints this code. The internal reader reports it as:
INVALID_MAPPING_CONFIGURATION: Mapping evidence acquisition failed.
Hint: A mapping read at API 65 was not a single object where one was expected. Check the mapping in Data Cloud Setup and read it with sf data360 retrieve instead.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_CONFIGURATION.md
```

## Related codes

- [`UNKNOWN_MAPPING_CONFIGURATION`](../mapping/UNKNOWN_MAPPING_CONFIGURATION.md) — a mapping read at API 65 has unknown or missing keys.
- [`INVALID_MAPPING_RUNTIME`](../mapping/INVALID_MAPPING_RUNTIME.md) — a mapping read at API 65 has an unexpected status, name or pair count.
