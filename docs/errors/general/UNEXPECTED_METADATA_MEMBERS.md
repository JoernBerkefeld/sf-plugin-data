# `UNEXPECTED_METADATA_MEMBERS`

> The Salesforce CLI retrieve returned other files than the one requested source file. Check the member name in the org, then rerun the retrieve.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | General                                                                    |
| **Commands** | `sf data360 retrieve` (calculated insights)                                |
| **Outcome**  | `blocked` — no file was written for the component; the org was not changed |

## What it means

The plugin asked the Salesforce CLI for exactly one calculated insight source file. The CLI reported success but returned no file, more than one file, or a file of another type, another name, or a state other than newly created.

## Why the plugin stops

The XML file must belong to exactly the calculated insight being retrieved. Any other result could pair the JSON file with the wrong XML.

## How to fix

1. Check the calculated insight's API name in the org; it is the name without `__cio`.
2. Run the step yourself and look at the `files` list: `sf project retrieve start --metadata MktCalcInsightObjectDef:<Name> --target-org <alias> --api-version 65.0 --json`.
3. Rerun the retrieve.

## Example output

```text
Retrieve: blocked.
calculated-insight:Lifetime_Value__cio: UNEXPECTED_METADATA_MEMBERS: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The Salesforce CLI retrieve returned other files than the one requested source file. Check the member name in the org, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/UNEXPECTED_METADATA_MEMBERS.md
Downloaded calculated-insight: 0
```

## Related codes

- [`STANDARD_RETRIEVE_UNCONFIRMED`](../general/STANDARD_RETRIEVE_UNCONFIRMED.md) — the CLI did not report success.
- [`INVALID_STANDARD_RETRIEVE`](../general/INVALID_STANDARD_RETRIEVE.md) — the returned file or output was unusable.
