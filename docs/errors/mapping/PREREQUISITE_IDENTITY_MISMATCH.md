# `PREREQUISITE_IDENTITY_MISMATCH`

> A read of the source or target object of a mapping returned a different object name than requested. Check the API name of the object in the org, then rerun.

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                |
| **Commands** | None at present — raised by the plugin's internal mapping read, which no command calls |
| **Outcome**  | `blocked` — nothing was written                                                        |

## What it means

The plugin asked for the source DLO or target DMO of a mapping by name, and one of the answers named a different object.

## Why the plugin stops

A mapping is only meaningful together with the exact source and target objects it connects. When the two independent reads of an object do not give one clear answer, the plugin cannot tell which fields the mapping really links and stops instead of guessing.

## How to fix

1. Check the exact API names of the source DLO and target DMO.
2. Rerun.

## Example output

```text
Retrieve: blocked.
mapping:Contact_Map: PREREQUISITE_IDENTITY_MISMATCH: Mapping evidence acquisition failed.
Hint: A read of the source or target object of a mapping returned a different object name than requested. Check the API name of the object in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/PREREQUISITE_IDENTITY_MISMATCH.md
```

## Related codes

- [`AMBIGUOUS_PREREQUISITE_EVIDENCE`](../mapping/AMBIGUOUS_PREREQUISITE_EVIDENCE.md) — the Metadata API returned none or several definitions.
