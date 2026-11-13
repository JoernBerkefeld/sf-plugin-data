# `MAPPING_PROTECTED_LAYOUT_UNPROVEN`

> The plugin could not prove which pairs of this mapping must stay (key, key qualifier and system pairs), so it removes none. Keep those pairs, or change the mapping in the org.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Your file removes pairs from an existing mapping. Before any removal, the plugin identifies the pairs that must never be removed: the primary key pair and the pairs Salesforce generates. That failed because:

- no primary key to primary key pair was found,
- a protected pair targets a field the DMO does not report as mapped, or
- a pair you remove targets a system or key qualifier field that is not recognised as generated.

## Why the plugin stops

Removing a key, key qualifier or system pair can break identity resolution and data flow into the DMO. When the plugin cannot prove which pairs are safe to remove, it removes none.

## How to fix

1. Check that the mapping maps the DLO primary key onto the DMO primary key.
2. Keep pairs onto system and key qualifier fields in the file.
3. If the DMO is still settling, wait and rerun.
4. If needed, remove the pair in Data Cloud Setup instead.

## Example output

```text
Deploy preview: blocked (MAPPING_PROTECTED_LAYOUT_UNPROVEN). No deployment executed.
MAPPING_PROTECTED_LAYOUT_UNPROVEN: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The plugin could not prove which pairs of this mapping must stay (key, key qualifier and system pairs), so it removes none. Keep those pairs, or change the mapping in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_PROTECTED_LAYOUT_UNPROVEN.md
```

## Related codes

- [`MAPPING_PROTECTED_PAIR_REQUIRED`](../mapping/MAPPING_PROTECTED_PAIR_REQUIRED.md) — the file omits a pair that must never be removed.
- [`MAPPING_SELECTOR_REQUIRED`](../mapping/MAPPING_SELECTOR_REQUIRED.md) — an org pair has no pair name to remove it by.
