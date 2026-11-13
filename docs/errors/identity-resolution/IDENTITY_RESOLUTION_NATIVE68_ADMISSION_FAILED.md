# `IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED`

> The ruleset, its inputs or the target could not be verified before the write, so nothing was changed. Check the file, the referenced DMOs and the org, then rerun with --preview.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before writing a ruleset, the plugin checks the file, the API version and data space (API 68, default space), the DMOs the ruleset uses, and the current ruleset in the org. It repeats these checks right before the write. This code means one of them failed and no more specific code applies: for example the org returned a ruleset the plugin cannot read, a referenced DMO changed between two checks, or the ruleset changed in the org during the run.

When Salesforce sent an error, its detail is part of the message.

## Why the plugin stops

An identity resolution write starts processing in Salesforce. The plugin only sends it when every check before it has passed.

## How to fix

1. Read the message for a Salesforce detail and fix that cause first.
2. Check that the DMOs and fields named in the file exist in the target org.
3. Make sure nobody else changes the ruleset during the deploy.
4. Rerun `sf data360 deploy --preview`, then deploy.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: identity-resolution:Individual_Main.
IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED: The ruleset, its inputs or the target could not be verified before the write, so nothing was changed. Check the file, the referenced DMOs and the org, then rerun with --preview.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_BINDING_UNQUALIFIED`](../identity-resolution/IDENTITY_RESOLUTION_BINDING_UNQUALIFIED.md) — the referenced DMOs or fields could not be verified.
- [`IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED`](../identity-resolution/IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED.md) — the failure came after the write was sent.
