# `INVALID_PREREQUISITE_EVIDENCE`

> A read of the source or target object of a mapping returned no usable record. Check that the object exists and that you can read it, then rerun.

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                |
| **Commands** | None at present — raised by the plugin's internal mapping read, which no command calls |
| **Outcome**  | `blocked` — nothing was written                                                        |

## What it means

One of the reads of the source DLO or target DMO of a mapping returned something other than a single record.

## Why the plugin stops

A mapping is only meaningful together with the exact source and target objects it connects. When the two independent reads of an object do not give one clear answer, the plugin cannot tell which fields the mapping really links and stops instead of guessing.

## How to fix

1. Check that the source DLO and target DMO exist in the org.
2. Check that your user can read them, then rerun.

## Example output

```text
Retrieve: blocked.
mapping:Contact_Map: INVALID_PREREQUISITE_EVIDENCE: Mapping evidence acquisition failed.
Hint: A read of the source or target object of a mapping returned no usable record. Check that the object exists and that you can read it, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_PREREQUISITE_EVIDENCE.md
```

## Related codes

- [`AMBIGUOUS_PREREQUISITE_EVIDENCE`](../mapping/AMBIGUOUS_PREREQUISITE_EVIDENCE.md) — the Metadata API returned none or several definitions.
