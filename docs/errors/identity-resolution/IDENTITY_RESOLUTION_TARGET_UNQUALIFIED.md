# `IDENTITY_RESOLUTION_TARGET_UNQUALIFIED`

> The ruleset could not be looked up in the target org; the error was not a plain not found. Check your Data Cloud access and any Salesforce detail, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

To decide between create and update, the plugin reads the ruleset by its API name. Only a clear "not found" answer means the ruleset is absent. Any other error (missing permission, expired session, service error) leaves the state unknown and produces this code.

When Salesforce sent an error, its detail is part of the message.

## Why the plugin stops

Creating a ruleset that may already exist, or updating one the plugin could not read, could overwrite or duplicate configuration. The plugin only acts on a confirmed state.

## How to fix

1. Read the Salesforce detail in the message.
2. Check that your session is valid (`sf org display --target-org <alias>`) and that your user can read identity resolution rulesets.
3. Rerun the deploy.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: identity-resolution:Individual_Main.
IDENTITY_RESOLUTION_TARGET_UNQUALIFIED: The ruleset could not be looked up in the target org; the error was not a plain not found. Check your Data Cloud access and any Salesforce detail, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_TARGET_UNQUALIFIED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_ACQUISITION_FAILED`](../identity-resolution/IDENTITY_RESOLUTION_ACQUISITION_FAILED.md) — the same kind of read failure during retrieve.
