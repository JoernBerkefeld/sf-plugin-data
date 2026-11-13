# `MAPPING_PROTECTED_PAIR_REQUIRED`

> The mapping file leaves out a pair that must never be unmapped, such as the primary key pair. Add that pair back to fieldMappings and rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The mapping in the org has a protected pair, usually the pair from the DLO primary key to the DMO primary key, and your file does not list it. A deploy makes the org match the file, so it would remove that pair.

## Why the plugin stops

The primary key pair connects every record to the DMO. Removing it would break the mapping, so the plugin refuses the whole update.

## How to fix

1. Retrieve the mapping: `sf data360 retrieve --metadata mapping:<Name>`.
2. Copy the primary key pair into your file's `fieldMappings`.
3. Rerun the deploy with `--preview`.

## Example output

```text
Deploy preview: blocked (MAPPING_PROTECTED_PAIR_REQUIRED). No deployment executed.
MAPPING_PROTECTED_PAIR_REQUIRED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The mapping file leaves out a pair that must never be unmapped, such as the primary key pair. Add that pair back to fieldMappings and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_PROTECTED_PAIR_REQUIRED.md
```

## Related codes

- [`MAPPING_PROTECTED_LAYOUT_UNPROVEN`](../mapping/MAPPING_PROTECTED_LAYOUT_UNPROVEN.md) — the pairs that must stay could not be identified.
