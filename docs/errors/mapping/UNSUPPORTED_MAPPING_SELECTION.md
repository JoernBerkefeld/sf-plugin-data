# `UNSUPPORTED_MAPPING_SELECTION`

> The target org value cannot be passed on safely: it is empty, starts with a dash or contains control characters. Pass a valid alias or username with --target-org.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Mapping                                                         |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

Some mapping operations run through the Salesforce CLI with the target org as an argument. The org alias or username was empty, began with `-`, or contained control characters.

## Why the plugin stops

Such a value could be read as another option or break the command line. The plugin refuses it before running anything.

## How to fix

1. Check `--target-org`, or the default target org of your project.
2. Use the alias or username shown by `sf org list`.
3. Rerun the command.

## Example output

```text
Deploy preview: blocked (UNSUPPORTED_MAPPING_SELECTION). No deployment executed.
UNSUPPORTED_MAPPING_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The target org value cannot be passed on safely: it is empty, starts with a dash or contains control characters. Pass a valid alias or username with --target-org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/UNSUPPORTED_MAPPING_SELECTION.md
```

## Related codes

- [`INVALID_MAPPING_NAME`](../mapping/INVALID_MAPPING_NAME.md) — the mapping name itself is malformed.
