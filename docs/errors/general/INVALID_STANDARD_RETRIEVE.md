# `INVALID_STANDARD_RETRIEVE`

> The Salesforce CLI retrieve that fetches the source XML returned output the plugin could not use. Run sf project retrieve start for the same member to see the error, then rerun.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | General                                                                    |
| **Commands** | `sf data360 retrieve` (calculated insights)                                |
| **Outcome**  | `blocked` — no file was written for the component; the org was not changed |

## What it means

To export a calculated insight, the plugin fetches its standard source XML with the Salesforce CLI (`sf project retrieve start --json`) into a private temporary project. `INVALID_STANDARD_RETRIEVE` means that step returned something the plugin could not use: the CLI output was not JSON, or the retrieved XML file was missing, linked, larger than 1 MiB or not a regular file.

## Why the plugin stops

The XML file becomes half of the calculated insight pair in your project. If the plugin cannot read it cleanly, it does not write a pair that may be incomplete.

## How to fix

1. Run the CLI step yourself to see its output: `sf project retrieve start --metadata MktCalcInsightObjectDef:<Name> --target-org <alias> --api-version 65.0 --json` in an empty test project.
2. Update the Salesforce CLI if its output looks unusual (`sf update` or `npm install --global @salesforce/cli`).
3. Rerun `sf data360 retrieve -m calculated-insight:<Name>__cio`.

## Example output

```text
Retrieve: blocked.
calculated-insight:Lifetime_Value__cio: INVALID_STANDARD_RETRIEVE: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The Salesforce CLI retrieve that fetches the source XML returned output the plugin could not use. Run sf project retrieve start for the same member to see the error, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_STANDARD_RETRIEVE.md
Downloaded calculated-insight: 0
```

## Related codes

- [`STANDARD_RETRIEVE_UNCONFIRMED`](../general/STANDARD_RETRIEVE_UNCONFIRMED.md) — the CLI reported that the retrieve did not succeed.
- [`UNEXPECTED_METADATA_MEMBERS`](../general/UNEXPECTED_METADATA_MEMBERS.md) — the CLI returned other files than the one requested.
- [`STANDARD_RETRIEVE_UNKNOWN`](../general/STANDARD_RETRIEVE_UNKNOWN.md) — the CLI process ended without an exit code.
