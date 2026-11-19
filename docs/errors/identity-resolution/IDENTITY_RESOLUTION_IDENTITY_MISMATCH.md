# `IDENTITY_RESOLUTION_IDENTITY_MISMATCH`

> The org returned a ruleset whose name differs from the one requested, so no file was written. Check the exact ruleset API name, then rerun.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Identity resolution             |
| **Commands** | `sf data360 retrieve`           |
| **Outcome**  | `blocked` — nothing was written |

## What it means

The retrieve read the ruleset you named, but the definition it got back carries a different API name than the one you asked for (for example a different spelling). A ruleset of another data space is [`IDENTITY_RESOLUTION_DATASPACE_MISMATCH`](../identity-resolution/IDENTITY_RESOLUTION_DATASPACE_MISMATCH.md).

## Why the plugin stops

The file name and its contents must name the same ruleset. A file written under one name with the contents of another would later deploy to the wrong ruleset.

## How to fix

1. Look up the exact API name of the ruleset in Data Cloud, including letter case.
2. Rerun `sf data360 retrieve --metadata identity-resolution:<ExactName>`.

## Example output

```text
Retrieve: blocked.
IDENTITY_RESOLUTION_IDENTITY_MISMATCH: The selection could not be retrieved completely; no files were written.
Hint: The org returned a ruleset whose name differs from the one requested, so no file was written. Check the exact ruleset API name, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_IDENTITY_MISMATCH.md
```

## Related codes

- [`IDENTITY_RESOLUTION_ACQUISITION_FAILED`](../identity-resolution/IDENTITY_RESOLUTION_ACQUISITION_FAILED.md) — the ruleset could not be read at all.
