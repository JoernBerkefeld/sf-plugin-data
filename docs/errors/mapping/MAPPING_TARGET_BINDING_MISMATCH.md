# `MAPPING_TARGET_BINDING_MISMATCH`

> The mapping found in the org binds a different source DLO, target DMO or data space than the mapping file. Check the file's binding against the org before deploying.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 deploy`                                                  |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

The plugin finds the existing mapping by its source DLO and target DMO, then reads it again after each write. One of these reads returned a mapping whose source, target or data space differs from your file.

## Why the plugin stops

A mapping with another binding is a different mapping. Writing to it would change pairs between objects you did not name.

## How to fix

1. Read the expected and observed values in the message.
2. Check `sourceEntityDeveloperName`, `targetEntityDeveloperName` and `identity.dataSpace` in your file.
3. Inspect the mapping in the org, then rerun.

## Example output

```text
Deploy preview: blocked (MAPPING_TARGET_BINDING_MISMATCH). No deployment executed.
MAPPING_TARGET_BINDING_MISMATCH: Plugin verification failed during mapping binding readback for Customer_Home_map: $.sourceEntityDeveloperName: expected Customer_Home__dll; observed Customer_Web__dll. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The mapping found in the org binds a different source DLO, target DMO or data space than the mapping file. Check the file's binding against the org before deploying.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_TARGET_BINDING_MISMATCH.md
```

## Related codes

- [`AMBIGUOUS_MAPPING_TARGET`](../mapping/AMBIGUOUS_MAPPING_TARGET.md) — more than one org mapping matches, so none is chosen.
- [`MAPPING_DEPENDENCY_IDENTITY_MISMATCH`](../mapping/MAPPING_DEPENDENCY_IDENTITY_MISMATCH.md) — the source DLO or target DMO read back under another name.
