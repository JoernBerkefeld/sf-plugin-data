# `INVALID_MAPPING_NAME`

> The mapping API name is not valid: it must start with a letter and use only letters, digits and underscores, at most 240 characters. Correct the mapping name.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Mapping                                                         |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

A mapping name used to read, update or delete a mapping did not have the expected shape. Mapping names start with a letter, contain only letters, digits and underscores, and are at most 240 characters long.

## Why the plugin stops

The name becomes part of the request URL or of the destructive deployment. An unchecked name could address a different resource, so nothing is sent.

## How to fix

1. Check the name after `mapping:` in `--metadata`.
2. Use the exact mapping API name shown in Data Cloud Setup or in a retrieved file's `identity.apiName`.
3. Rerun the command.

## Example output

```text
Delete: blocked.
Blocked: mapping:Customer_Home_map; mutation: not-attempted.
INVALID_MAPPING_NAME: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The mapping API name is not valid: it must start with a letter and use only letters, digits and underscores, at most 240 characters. Correct the mapping name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_NAME.md
```

## Related codes

- [`INVALID_MAPPING_BINDING`](../mapping/INVALID_MAPPING_BINDING.md) — a DMO or DLO name used for a mapping lookup is malformed.
- [`MAPPING_TARGET_IDENTITY_MISMATCH`](../mapping/MAPPING_TARGET_IDENTITY_MISMATCH.md) — Salesforce returned a mapping under another name.
