# `TARGET_ORG_REQUIRED`

> No usable target org was found. Pass --target-org <alias or username>, or set a default with sf config set target-org, then rerun.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | General                                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was read, written or deleted                                      |

## What it means

The command needs an authenticated org, but none could be resolved: `--target-org` was not given and no default `target-org` is configured, the alias is unknown, or the org has no username stored.

The plugin checks the local selection first, so this code appears only after the selection itself is valid.

## Why the plugin stops

Without a clear target the plugin would have to guess which org to read from or write to. It never does.

## How to fix

1. List your orgs: `sf org list`.
2. Pass one explicitly with `--target-org <alias>`, or set a default: `sf config set target-org <alias>`.
3. If the org is missing, log in: `sf org login web --alias <alias>`.

## Example output

```text
Deploy execution: blocked (TARGET_ORG_REQUIRED). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
TARGET_ORG_REQUIRED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: No usable target org was found. Pass --target-org <alias or username>, or set a default with sf config set target-org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/TARGET_ORG_REQUIRED.md
```

## Related codes

- [`AUTHENTICATION_FAILED`](../general/AUTHENTICATION_FAILED.md) — an org was found but its session could not be used.
