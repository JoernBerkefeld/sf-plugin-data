# `IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH`

> A new ruleset must be named after its configuration type, as <type> or <type>_<rulesetId>. Rename the file and its apiName to match, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The ruleset does not exist in the target yet, so the deploy would create it. Salesforce names a new ruleset after its configuration type: `<type>` for the default ruleset, or `<type>_<rulesetId>` otherwise (for example `Individual_Main` for type `Individual`). The API name in your file follows neither form.

## Why the plugin stops

Salesforce would create the ruleset under a different name than the one in your file. The file and the org would then no longer match, and later deploys would try to create it again.

## How to fix

1. Pick a name of the form `<type>` or `<type>_<rulesetId>`, where `<type>` is `spec.configurationType`.
2. Set `identity.apiName` to that name and rename the file to `<name>.identityResolution.json`.
3. Rerun the deploy.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: identity-resolution:Main_Individual.
IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH: A new ruleset must be named after its configuration type, as <type> or <type>_<rulesetId>. Rename the file and its apiName to match, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH.md
```

## Related codes

None.
