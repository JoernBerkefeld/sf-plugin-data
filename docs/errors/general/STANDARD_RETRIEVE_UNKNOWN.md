# `STANDARD_RETRIEVE_UNKNOWN`

> The Salesforce CLI process ended without an exit code, for example after a timeout or with too much output. Check that sf runs on its own, then rerun the retrieve.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | General                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`            |
| **Outcome**  | `blocked` — no file was written for the component; the org was not changed |

## What it means

For native DLO, DMO, mapping, relationship and data stream requests the plugin runs `sf api request rest` as a child process. This code means that process ended without a normal exit code. Typical causes: it ran longer than about five and a half minutes, it printed more than 4 MiB, it was stopped by another program, or `sf` could not be started at all.

## Why the plugin stops

Without an exit code the plugin cannot tell whether the retrieve succeeded. It does not guess.

## How to fix

1. Run `sf --version` to check that the CLI starts.
2. Run a read yourself to see how long it takes: `sf api request rest /services/data/v68.0/ssot/data-model-objects --target-org <alias>`.
3. Rerun when the org responds normally.

## Example output

```text
Retrieve: blocked.
dmo:Customer__dlm: STANDARD_RETRIEVE_UNKNOWN: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The Salesforce CLI process ended without an exit code, for example after a timeout or with too much output. Check that sf runs on its own, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/STANDARD_RETRIEVE_UNKNOWN.md
Downloaded dmo: 0
```

## Related codes

- [`STANDARD_CLI_UNAVAILABLE`](../general/STANDARD_CLI_UNAVAILABLE.md) — the CLI installation was not found.
