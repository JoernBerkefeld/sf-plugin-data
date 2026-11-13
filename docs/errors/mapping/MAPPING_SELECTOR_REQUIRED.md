# `MAPPING_SELECTOR_REQUIRED`

> A mapping pair read from the org has no pair name, so it cannot be removed on its own. Rerun later; if it persists, change the mapping in Data Cloud Setup.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Mapping                                          |
| **Commands** | `sf data360 deploy`, `sf data360 delete --field` |
| **Outcome**  | `blocked` — nothing was changed                  |

## What it means

Salesforce removes a single pair by its pair name (`developerName`). When an update removes pairs, or a DMO field delete must account for pairs onto that field, a pair read from the org had no pair name.

## Why the plugin stops

Without the pair name the plugin cannot address that pair, and it never guesses one. Going on could leave the mapping half changed.

## How to fix

1. Rerun the command; a mapping that was just created may not have pair names yet.
2. If it persists, remove or change the pair in Data Cloud Setup.

## Example output

```text
Deploy preview: blocked (MAPPING_SELECTOR_REQUIRED). No deployment executed.
MAPPING_SELECTOR_REQUIRED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: A mapping pair read from the org has no pair name, so it cannot be removed on its own. Rerun later; if it persists, change the mapping in Data Cloud Setup.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_SELECTOR_REQUIRED.md
```

## Related codes

- [`MAPPING_PROTECTED_LAYOUT_UNPROVEN`](../mapping/MAPPING_PROTECTED_LAYOUT_UNPROVEN.md) — the pairs that must stay could not be identified.
- [`INVALID_MAPPING_FIELD`](../mapping/INVALID_MAPPING_FIELD.md) — a single field pair breaks the file format.
