# `INVALID_PREREQUISITE_FIELDS`

> The source or target object of a mapping returned no field list, or more than 4096 fields. Check the object and its fields in the org, then rerun.

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                |
| **Commands** | None at present — raised by the plugin's internal mapping read, which no command calls |
| **Outcome**  | `blocked` — nothing was written                                                        |

## What it means

The field list of the source DLO or target DMO of a mapping was missing, empty or longer than 4096 entries in one of the two reads.

## Why the plugin stops

A mapping is only meaningful together with the exact source and target objects it connects. When the two independent reads of an object do not give one clear answer, the plugin cannot tell which fields the mapping really links and stops instead of guessing.

## How to fix

1. Check that the source DLO and target DMO have fields in the org.
2. Rerun.

## Example output

```text
Retrieve: blocked.
mapping:Contact_Map: INVALID_PREREQUISITE_FIELDS: Mapping evidence acquisition failed.
Hint: The source or target object of a mapping returned no field list, or more than 4096 fields. Check the object and its fields in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_PREREQUISITE_FIELDS.md
```

## Related codes

- [`AMBIGUOUS_PREREQUISITE_FIELDS`](../mapping/AMBIGUOUS_PREREQUISITE_FIELDS.md) — a field name is empty or appears twice.
