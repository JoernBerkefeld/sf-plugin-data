# `IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED`

> Creating or updating a ruleset starts processing in Salesforce, and a create also adds unified objects to the org. Rerun with --allow-processing to accept this.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Deploying an identity resolution ruleset is more than a configuration change: Salesforce reprocesses the ruleset, and a new ruleset also creates unified and link DMOs in the org. The plugin only does this when you accept these effects with `--allow-processing`.

The command usually catches a missing flag earlier and reports `PROCESSING_ACKNOWLEDGEMENT_REQUIRED`; this code is the same check made again right before the write.

## Why the plugin stops

Processing uses org resources and a create adds objects that stay in the org. The plugin never starts either without your explicit consent.

## How to fix

1. Review the planned change with `sf data360 deploy --preview`.
2. Rerun the deploy with `--allow-processing`.

An identical ruleset (`unchanged`) needs no flag.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: identity-resolution:Individual_Main; mutation: not-attempted.
IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED: IR deployment blocked by input, scope, effects or target verification.
Hint: Creating or updating a ruleset starts processing in Salesforce, and a create also adds unified objects to the org. Rerun with --allow-processing to accept this.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED.md
```

## Related codes

- [`PROCESSING_ACKNOWLEDGEMENT_REQUIRED`](../general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md) — the same consent, checked for the whole selection.
