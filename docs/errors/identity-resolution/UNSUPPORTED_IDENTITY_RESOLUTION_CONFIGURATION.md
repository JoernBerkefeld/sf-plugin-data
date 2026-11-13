# `UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION`

> The ruleset returned by the org has a shape or size the plugin cannot check, so no file was written. Check the ruleset in Data Cloud, for example its reconciliation rules.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 retrieve`           |
| **Outcome**  | `blocked` — nothing was written |

## What it means

The plugin turns the ruleset returned by Salesforce into a portable file and checks every part of it. This code means a part did not pass: an unexpected or missing key, a value that is too long or too deeply nested, a name that is not a valid API name, a data space other than `default`, or more than one reconciliation rule for the same object.

## Why the plugin stops

A file the plugin cannot check could deploy differently from what is in the org. The plugin writes only files it can represent exactly.

## How to fix

1. Open the ruleset in Data Cloud and look for unusual settings, such as two reconciliation rules for one object.
2. Simplify the ruleset if possible, then rerun the retrieve.

## Example output

```text
Retrieve: blocked.
UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION: The selection could not be retrieved completely; no files were written.
Hint: The ruleset returned by the org has a shape or size the plugin cannot check, so no file was written. Check the ruleset in Data Cloud, for example its reconciliation rules.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION.md
```

## Related codes

- [`INCOMPLETE_IDENTITY_RESOLUTION`](../identity-resolution/INCOMPLETE_IDENTITY_RESOLUTION.md) — the answer had no definition at all.
- [`UNSUPPORTED_DATA_GRAPH_CONFIGURATION`](../data-graph/UNSUPPORTED_DATA_GRAPH_CONFIGURATION.md) — the same check for data graphs.
