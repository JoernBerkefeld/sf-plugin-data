# `STANDARD_RETRIEVE_UNKNOWN`

> The Salesforce CLI process ended without an exit code, for example after a timeout or with too much output. Check that sf runs on its own, then rerun the retrieve.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | General                                                                    |
| **Commands** | `sf data360 retrieve` (calculated insights)                                |
| **Outcome**  | `blocked` — no file was written for the component; the org was not changed |

## What it means

The plugin started `sf project retrieve start` to fetch the calculated insight's source XML, but the process ended without a normal exit code. Typical causes: it ran longer than about five and a half minutes, it printed more than 4 MiB, it was stopped by another program, or `sf` could not be started at all.

## Why the plugin stops

Without an exit code the plugin cannot tell whether the retrieve succeeded. It does not guess.

## How to fix

1. Run `sf --version` to check that the CLI starts.
2. Run the retrieve step yourself to see how long it takes: `sf project retrieve start --metadata MktCalcInsightObjectDef:<Name> --target-org <alias> --api-version 65.0 --json`.
3. Rerun when the org responds normally.

## Example output

```text
Retrieve: blocked.
calculated-insight:Lifetime_Value__cio: STANDARD_RETRIEVE_UNKNOWN: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The Salesforce CLI process ended without an exit code, for example after a timeout or with too much output. Check that sf runs on its own, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/STANDARD_RETRIEVE_UNKNOWN.md
Downloaded calculated-insight: 0
```

## Related codes

- [`STANDARD_CLI_UNAVAILABLE`](../general/STANDARD_CLI_UNAVAILABLE.md) — the CLI installation was not found.
- [`STANDARD_RETRIEVE_UNCONFIRMED`](../general/STANDARD_RETRIEVE_UNCONFIRMED.md) — the CLI ran but did not report success.
