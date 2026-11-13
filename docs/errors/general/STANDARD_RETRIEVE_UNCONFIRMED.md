# `STANDARD_RETRIEVE_UNCONFIRMED`

> The Salesforce CLI did not report a clean, successful retrieve of the source XML. Run sf project retrieve start for the same member to see its errors or warnings, then rerun.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | General                                                                    |
| **Commands** | `sf data360 retrieve` (calculated insights)                                |
| **Outcome**  | `blocked` — no file was written for the component; the org was not changed |

## What it means

The plugin runs `sf project retrieve start --json` for the calculated insight's standard source XML and accepts the result only when the command exits with 0, reports status `Succeeded`, is done and successful, and has no messages or warnings. At least one of those conditions was not met, for example because the member does not exist in the org, the user lacks permission, or the CLI printed a warning.

## Why the plugin stops

The XML is half of the calculated insight pair. A retrieve with warnings may have returned something other than what was asked for, so the plugin does not write it.

## How to fix

1. Run the step yourself in an empty project: `sf project retrieve start --metadata MktCalcInsightObjectDef:<Name> --target-org <alias> --api-version 65.0 --json`.
2. Fix what the CLI reports (missing member, permissions, CLI warnings).
3. Rerun the retrieve.

## Example output

```text
Retrieve: blocked.
calculated-insight:Lifetime_Value__cio: STANDARD_RETRIEVE_UNCONFIRMED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The Salesforce CLI did not report a clean, successful retrieve of the source XML. Run sf project retrieve start for the same member to see its errors or warnings, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/STANDARD_RETRIEVE_UNCONFIRMED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`INVALID_STANDARD_RETRIEVE`](../general/INVALID_STANDARD_RETRIEVE.md) — the CLI output could not be read at all.
- [`UNEXPECTED_METADATA_MEMBERS`](../general/UNEXPECTED_METADATA_MEMBERS.md) — the CLI returned other files than the one requested.
