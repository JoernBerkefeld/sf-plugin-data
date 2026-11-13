# `IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED`

> The file changes the configuration type or secondary DMO of an existing ruleset, which an update cannot carry. Revert those fields, or delete the ruleset and deploy it again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The ruleset exists in the target and differs from your file in a field that an update request does not carry: `spec.configurationType` or `spec.secondaryDmo`. Other settings (match rules, reconciliation rules, filters, trusted sources, labels) can be updated.

## Why the plugin stops

An update would leave those fields as they are in the org, so the ruleset would never match your file. The plugin does not delete and recreate a ruleset on its own.

## How to fix

- To keep the existing ruleset: set `configurationType` and `secondaryDmo` back to the values in the org (retrieve it to see them), then deploy.
- To really change them: delete the ruleset with `sf data360 delete --confirm-delete`, wait until it is gone, then deploy the file as a new ruleset.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked-changes: identity-resolution:Individual_Main.
IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED: The file changes the configuration type or secondary DMO of an existing ruleset, which an update cannot carry. Revert those fields, or delete the ruleset and deploy it again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH`](../identity-resolution/IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH.md) — the naming rule for a new ruleset.
