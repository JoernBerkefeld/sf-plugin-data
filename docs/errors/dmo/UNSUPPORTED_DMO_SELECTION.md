# `UNSUPPORTED_DMO_SELECTION`

> The target org passed to a DMO request is not valid. Pass --target-org with the alias or username of an authenticated org.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data model object                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — no request was sent                                 |

## What it means

Before it creates a DMO client, the plugin checks the target org value: it must not be empty, must not start with `-` and must not contain control characters. The value failed that check.

## Why the plugin stops

The value is passed to the Salesforce CLI as a command-line argument. A value that looks like a flag or contains control characters could change the command that runs, so it is refused.

## How to fix

1. Run `sf org list` to see your authenticated orgs.
2. Pass `--target-org <alias or username>`, or set a default target org.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (UNSUPPORTED_DMO_SELECTION). No automatic retry or rollback performed.
UNSUPPORTED_DMO_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The target org passed to a DMO request is not valid. Pass --target-org with the alias or username of an authenticated org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/UNSUPPORTED_DMO_SELECTION.md
```

## Related codes

- [`TARGET_ORG_REQUIRED`](../general/TARGET_ORG_REQUIRED.md) — no target org could be resolved.
- [`UNSUPPORTED_DLO_SELECTION`](../dlo/UNSUPPORTED_DLO_SELECTION.md) — the same check for data lake object requests.
