# `AMBIGUOUS_PREREQUISITE_FIELDS`

> The source or target object of a mapping lists the same field twice, or a field without a name, so its fields could not be matched. Check the fields of the object in the org.

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                |
| **Commands** | None at present — raised by the plugin's internal mapping read, which no command calls |
| **Outcome**  | `blocked` — nothing was written                                                        |

## What it means

The plugin compares the field list of the source DLO and target DMO from two reads. In one of the lists a field name is empty or appears more than once.

## Why the plugin stops

A mapping is only meaningful together with the exact source and target objects it connects. When the two independent reads of an object do not give one clear answer, the plugin cannot tell which fields the mapping really links and stops instead of guessing.

## How to fix

1. Check the fields of the source DLO and target DMO in the org.
2. Resolve duplicate or unnamed fields, then rerun.

## Example output

```text
Retrieve: blocked.
mapping:Contact_Map: AMBIGUOUS_PREREQUISITE_FIELDS: Mapping evidence acquisition failed.
Hint: The source or target object of a mapping lists the same field twice, or a field without a name, so its fields could not be matched. Check the fields of the object in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/AMBIGUOUS_PREREQUISITE_FIELDS.md
```

## Related codes

- [`INVALID_PREREQUISITE_FIELDS`](../mapping/INVALID_PREREQUISITE_FIELDS.md) — the field list is missing or too long.
- [`PREREQUISITE_FIELD_CORRELATION_FAILED`](../mapping/PREREQUISITE_FIELD_CORRELATION_FAILED.md) — the two field lists differ.
