# `IDENTITY_RESOLUTION_BINDING_UNQUALIFIED`

> The DMOs and fields this ruleset uses, or the unified objects it creates, could not be verified in the target org. Check that they exist with the expected fields, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Before it writes a ruleset, the plugin checks every object the ruleset refers to in the target org: the secondary DMO, the DMOs named in the reconciliation rules and the fields used in the match rules. For an existing ruleset it also checks the unified and link objects the ruleset creates. Each object is read twice (Data Cloud and Metadata API) and both reads must agree.

This code means one of those checks failed: an object or field is missing, a field name appears twice, the two reads disagree, or a generated object does not belong to this ruleset.

## Why the plugin stops

Sending a ruleset that refers to objects the plugin could not confirm could change processing on the wrong data or fail halfway in Salesforce. The plugin stops before any write instead.

## How to fix

1. Make sure every DMO and field named in the `.identityResolution.json` file exists in the target org with the same API name.
2. If the DMOs are part of the same project, deploy them first (or select them in the same deploy).
3. Rerun `sf data360 deploy --preview` with the same file to confirm the check passes, then deploy.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: identity-resolution:Individual_Main.
IDENTITY_RESOLUTION_BINDING_UNQUALIFIED: The DMOs and fields this ruleset uses, or the unified objects it creates, could not be verified in the target org. Check that they exist with the expected fields, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_BINDING_UNQUALIFIED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED`](../identity-resolution/IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED.md) — the general check failure before an identity resolution write.
- [`IDENTITY_RESOLUTION_TARGET_UNQUALIFIED`](../identity-resolution/IDENTITY_RESOLUTION_TARGET_UNQUALIFIED.md) — the ruleset itself could not be looked up.
