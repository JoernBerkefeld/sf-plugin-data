# `AMBIGUOUS_PREREQUISITE_EVIDENCE`

> The Metadata API did not return exactly one definition for the source or target object of a mapping. Check that the object exists once in the org, then rerun.

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                |
| **Commands** | None at present — raised by the plugin's internal mapping read, which no command calls |
| **Outcome**  | `blocked` — nothing was written                                                        |

## What it means

To read a mapping, the plugin also reads its source DLO and target DMO, once through Data Cloud and once through the Metadata API. The Metadata API answer for one of these objects contained no definition or more than one.

## Why the plugin stops

A mapping is only meaningful together with the exact source and target objects it connects. When the two independent reads of an object do not give one clear answer, the plugin cannot tell which fields the mapping really links and stops instead of guessing.

## How to fix

1. Check the source DLO and target DMO of the mapping in the org.
2. Make sure each exists exactly once under its API name, then rerun.

## Example output

```text
Retrieve: blocked.
mapping:Contact_Map: AMBIGUOUS_PREREQUISITE_EVIDENCE: Mapping evidence acquisition failed.
Hint: The Metadata API did not return exactly one definition for the source or target object of a mapping. Check that the object exists once in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/AMBIGUOUS_PREREQUISITE_EVIDENCE.md
```

## Related codes

- [`INVALID_PREREQUISITE_EVIDENCE`](../mapping/INVALID_PREREQUISITE_EVIDENCE.md) — a read returned no usable record.
- [`PREREQUISITE_IDENTITY_MISMATCH`](../mapping/PREREQUISITE_IDENTITY_MISMATCH.md) — a read returned another object.
