# `INVALID_SEGMENT_DEPENDENCIES`

> The segment is built on a different DMO than the one its SQL reads, or its dependency entry does not match the SQL. Only segments whose DMO and SQL agree can be saved.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

A segment names the DMO it is built on, and its SQL model selects from a DMO. The plugin derives one dependency (DMO and field) from the SQL and requires that it matches the segment's DMO exactly.

This code means the two do not agree: the segment is built on one DMO while its SQL reads another, or the dependency list does not hold exactly that one DMO and field in the default data space.

## Why the plugin stops

The dependency entry is how the plugin checks, before any deploy or delete, that the target org has the DMO and field the segment needs. A dependency that does not match the SQL would make those checks meaningless.

## How to fix

1. Open the segment in the org and check which DMO it is built on and which DMO its SQL selects from.
2. Make both the same DMO, then retrieve again.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: INVALID_SEGMENT_DEPENDENCIES: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The segment is built on a different DMO than the one its SQL reads, or its dependency entry does not match the SQL. Only segments whose DMO and SQL agree can be saved.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/INVALID_SEGMENT_DEPENDENCIES.md
Downloaded segment: 0
```

## Related codes

- [`SQL_DEPENDENCIES_UNQUALIFIED`](../segment/SQL_DEPENDENCIES_UNQUALIFIED.md) — The SQL itself is not in the supported shape.
- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — The segment kind is not supported at all.
