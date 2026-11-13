# `STANDARD_CLI_UNAVAILABLE`

> The globally installed Salesforce CLI npm package was not found. Install it with npm install --global @salesforce/cli, then rerun the retrieve.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | General                                                                    |
| **Commands** | `sf data360 retrieve` (calculated insights, on Windows)                    |
| **Outcome**  | `blocked` — no file was written for the component; the org was not changed |

## What it means

For calculated insights the plugin runs `sf project retrieve start` to fetch the standard source XML. On Windows it starts the CLI directly through Node.js from the global npm installation (`%APPDATA%\npm\node_modules\@salesforce\cli\bin\run.js`), never through a shell. `STANDARD_CLI_UNAVAILABLE` means `APPDATA` is not set or that path is not a regular file.

The Salesforce CLI from the Windows installer is not found by this lookup. When the npm folder is missing entirely, the retrieve may report `RETRIEVE_FAILED` instead.

## Why the plugin stops

Starting the CLI through a shell would let arguments be interpreted by the shell. The plugin only starts a CLI it can locate exactly.

## How to fix

1. Install the CLI with npm: `npm install --global @salesforce/cli`.
2. Make sure `APPDATA` is set in the shell that runs `sf`.
3. Rerun `sf data360 retrieve -m calculated-insight:<Name>__cio`.

## Example output

```text
Retrieve: blocked.
calculated-insight:Lifetime_Value__cio: STANDARD_CLI_UNAVAILABLE: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The globally installed Salesforce CLI npm package was not found. Install it with npm install --global @salesforce/cli, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/STANDARD_CLI_UNAVAILABLE.md
Downloaded calculated-insight: 0
```

## Related codes

- [`STANDARD_RETRIEVE_UNKNOWN`](../general/STANDARD_RETRIEVE_UNKNOWN.md) — the CLI was started but ended without an exit code.
- [`RETRIEVE_FAILED`](../general/RETRIEVE_FAILED.md) — the general retrieve failure.
