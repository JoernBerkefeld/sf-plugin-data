# `PREREQUISITE_FIELD_CORRELATION_FAILED`

> The two reads of the source or target object of a mapping list different fields, or a mapped field is missing. Check the fields of the object in the org, then rerun.

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                |
| **Commands** | None at present — raised by the plugin's internal mapping read, which no command calls |
| **Outcome**  | `blocked` — nothing was written                                                        |

## What it means

The Data Cloud read and the Metadata API read of the source DLO or target DMO list different fields, or a field the mapping uses is not in the list.

## Why the plugin stops

A mapping is only meaningful together with the exact source and target objects it connects. When the two independent reads of an object do not give one clear answer, the plugin cannot tell which fields the mapping really links and stops instead of guessing.

## How to fix

1. Check that the fields used by the mapping exist on both objects.
2. If fields were just added or removed, wait a moment and rerun.

## Example output

```text
Retrieve: blocked.
mapping:Contact_Map: PREREQUISITE_FIELD_CORRELATION_FAILED: Mapping evidence acquisition failed.
Hint: The two reads of the source or target object of a mapping list different fields, or a mapped field is missing. Check the fields of the object in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/PREREQUISITE_FIELD_CORRELATION_FAILED.md
```

## Related codes

- [`AMBIGUOUS_PREREQUISITE_FIELDS`](../mapping/AMBIGUOUS_PREREQUISITE_FIELDS.md) — a field list could not be read clearly.
