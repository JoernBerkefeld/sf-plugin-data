# `UNSUPPORTED_RELATIONSHIP_SELECTION`

> The target org value cannot be passed on to Salesforce CLI. Use a plain org alias or username with --target-org.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Relationship                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                 |

## What it means

Relationship requests are sent through Salesforce CLI with the target org as an argument. The resolved target org is empty, starts with `-`, or contains control characters.

## Why the plugin stops

Such a value could be read by the CLI as a flag, or point to no org. The plugin does not send the request.

## How to fix

1. Pass `-o <alias>` or `--target-org <username>` with a plain alias or username.
2. Check `sf org list` for the exact alias.

## Example output

```text
Retrieve: failed.
relationship:Order__dlm: UNSUPPORTED_RELATIONSHIP_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Relationship retrieval did not complete for this item; the org was not changed.
Hint: The target org value cannot be passed on to Salesforce CLI. Use a plain org alias or username with --target-org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/UNSUPPORTED_RELATIONSHIP_SELECTION.md
Downloaded relationship: 0
```

## Related codes

- [`TARGET_ORG_REQUIRED`](../general/TARGET_ORG_REQUIRED.md) — No target org was given at all.
