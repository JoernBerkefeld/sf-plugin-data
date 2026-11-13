# `IDENTITY_RESOLUTION_ACQUISITION_FAILED`

> The identity resolution ruleset could not be read from the org. Check the API name, your Data Cloud access and any Salesforce detail, then rerun the retrieve.

|              |                                |
| ------------ | ------------------------------ |
| **Family**   | Identity resolution            |
| **Commands** | `sf data360 retrieve`          |
| **Outcome**  | `failed` — nothing was written |

## What it means

The retrieve asked the org for the identity resolution ruleset you named (`--metadata identity-resolution:<Name>`) and the request did not return a usable answer: for example the ruleset does not exist under that API name, your user lacks Data Cloud access, or the service answered with an error.

When Salesforce sent an error, its detail is part of the message.

## Why the plugin stops

Without a complete answer from the org the plugin has nothing reliable to write. It does not guess or write a partial file, and it does not retry on its own.

## How to fix

1. Check the exact ruleset API name in Data Cloud (it usually looks like `<ConfigurationType>_<RulesetId>`, for example `Individual_Main`).
2. Check that the target org (`--target-org`) is the one you expect and that your user can read identity resolution rulesets.
3. Read the Salesforce detail in the message, fix the cause, then rerun the retrieve.

## Example output

```text
Retrieve: failed.
IDENTITY_RESOLUTION_ACQUISITION_FAILED: The selection could not be retrieved completely; no files were written.
Hint: The identity resolution ruleset could not be read from the org. Check the API name, your Data Cloud access and any Salesforce detail, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_ACQUISITION_FAILED.md
```

## Related codes

- [`INCOMPLETE_IDENTITY_RESOLUTION`](../identity-resolution/INCOMPLETE_IDENTITY_RESOLUTION.md) — the org answered, but the answer was incomplete.
- [`UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION`](../identity-resolution/UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION.md) — the org answered with a ruleset the plugin cannot represent.
