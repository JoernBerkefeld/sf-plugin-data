# `INCOMPLETE_IDENTITY_RESOLUTION`

> The answer for the ruleset was incomplete, so no file was written. Rerun the retrieve; if it repeats, check the ruleset in Data Cloud.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 retrieve`           |
| **Outcome**  | `blocked` — nothing was written |

## What it means

The retrieve read the ruleset, but the result contained no definition and no more specific reason.

## Why the plugin stops

An incomplete definition would deploy as a different ruleset. The plugin writes a file only from a complete answer.

## How to fix

1. Rerun the retrieve.
2. If the code repeats, open the ruleset in Data Cloud and check that it is complete and not being changed.

## Example output

```text
Retrieve: blocked.
INCOMPLETE_IDENTITY_RESOLUTION: The selection could not be retrieved completely; no files were written.
Hint: The answer for the ruleset was incomplete, so no file was written. Rerun the retrieve; if it repeats, check the ruleset in Data Cloud.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/INCOMPLETE_IDENTITY_RESOLUTION.md
```

## Related codes

- [`IDENTITY_RESOLUTION_ACQUISITION_FAILED`](../identity-resolution/IDENTITY_RESOLUTION_ACQUISITION_FAILED.md) — the ruleset could not be read at all.
- [`UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION`](../identity-resolution/UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION.md) — the ruleset has a shape the plugin cannot represent.
