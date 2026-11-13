# `INVALID_DEFINITION`

> The mapping definition read from the org does not have the expected form, so it was not written. Check the mapping in the org, or retrieve it with -m mapping:<ApiName>.

|              |                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                                           |
| **Commands** | None of the current commands. The code belongs to a mapping export writer of the plugin that `sf data360 retrieve` does not call. |
| **Outcome**  | `blocked` — no file was written; the org was not changed                                                                          |

## What it means

The mapping export writer validates the standard Metadata API XML of a mapping before writing it to the project. `INVALID_DEFINITION` means that XML did not pass the check (wrong root element, missing parts, or a different mapping name).

## Why the plugin stops

Writing XML the plugin cannot read back would leave a file in the project that later commands refuse or misread.

## How to fix

1. Retrieve the mapping with `sf data360 retrieve -m mapping:<ApiName>`, which uses the native JSON route.
2. If the mapping looks unusual in Data Cloud setup, fix it there first.

## Example output

```text
Retrieve: blocked.
mapping:Customer_Map: INVALID_DEFINITION: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The mapping definition read from the org does not have the expected form, so it was not written. Check the mapping in the org, or retrieve it with -m mapping:<ApiName>.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_DEFINITION.md
```

## Related codes

- [`EVIDENCE_READ_FAILED`](../mapping/EVIDENCE_READ_FAILED.md) — the same export routine could not read all its inputs.
- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — the file could not be written.
