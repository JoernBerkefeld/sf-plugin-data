# `MAPPING_TARGET_IDENTITY_MISMATCH`

> Salesforce returned a mapping with a different name than the one requested, so the result was not trusted. Rerun the command; if it repeats, check the mapping name in the org.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Mapping                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`      |
| **Outcome**  | `blocked` before a write; `failed` with mutation `unknown` after one |

## What it means

A mapping was read, created or updated by name, and the answer carried another mapping name. During a create, a later read under the new name returned a different name.

## Why the plugin stops

Saving, comparing or confirming a mapping under the wrong name could overwrite another file or confirm the wrong change.

## How to fix

1. Check the mapping name you selected, including case.
2. Rerun the command.
3. If the error came after a write, inspect the mapping in the org before deploying again.

## Example output

```text
Retrieve: failed.
mapping:Customer_Home_map: MAPPING_TARGET_IDENTITY_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: Salesforce returned a mapping with a different name than the one requested, so the result was not trusted. Rerun the command; if it repeats, check the mapping name in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_TARGET_IDENTITY_MISMATCH.md
Downloaded mapping: 0
```

## Related codes

- [`INVALID_MAPPING_NAME`](../mapping/INVALID_MAPPING_NAME.md) — the mapping name itself is malformed.
- [`MAPPING_TARGET_BINDING_MISMATCH`](../mapping/MAPPING_TARGET_BINDING_MISMATCH.md) — the org mapping binds other objects than the file.
