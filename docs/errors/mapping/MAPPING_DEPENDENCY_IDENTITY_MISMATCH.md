# `MAPPING_DEPENDENCY_IDENTITY_MISMATCH`

> The source DLO or target DMO read from the org did not match the name or data space the mapping names. Check the mapping's object names and data space, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before comparing a mapping, the plugin reads its source DLO and target DMO (and, when pairs are removed, the source DLOs of every mapping of the DMO). One of those reads returned an object with a different name or data space than requested.

## Why the plugin stops

Pairs are checked against the fields of these objects. Using the wrong object's fields could add or remove pairs incorrectly.

## How to fix

1. Check `sourceEntityDeveloperName`, `targetEntityDeveloperName` and `identity.dataSpace` in the mapping file.
2. Check that the objects exist in that data space of the org.
3. Rerun the deploy; if it repeats, the org returned an inconsistent read.

## Example output

```text
Deploy preview: blocked (MAPPING_DEPENDENCY_IDENTITY_MISMATCH). No deployment executed.
MAPPING_DEPENDENCY_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The source DLO or target DMO read from the org did not match the name or data space the mapping names. Check the mapping's object names and data space, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DEPENDENCY_IDENTITY_MISMATCH.md
```

## Related codes

- [`MAPPING_TARGET_BINDING_MISMATCH`](../mapping/MAPPING_TARGET_BINDING_MISMATCH.md) — the org mapping binds other objects than the file.
- [`MAPPING_DATASPACE_MISMATCH`](../mapping/MAPPING_DATASPACE_MISMATCH.md) — the mapping file names another data space than the command.
