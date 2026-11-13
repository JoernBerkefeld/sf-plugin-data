# `PARTIAL_IDENTITY_RESOLUTION_OUTPUT`

> The ruleset file was written, but the final check of it failed, so it may not match the org. Inspect the .identityResolution.json file and retrieve again with --overwrite.

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| **Family**   | Identity resolution                                       |
| **Commands** | `sf data360 retrieve`                                     |
| **Outcome**  | `blocked` — a file was written but could not be confirmed |

## What it means

The retrieve wrote `data360/identityResolution/<Name>.identityResolution.json` and then read it back. The file on disk was not the expected content (for example another process changed it), or it could not be read back as a valid ruleset.

## Why the plugin stops

The plugin cannot vouch for a file it could not confirm, and it does not delete files it has already placed. It reports the state so you can check it.

## How to fix

1. Open the file and check it, or delete it.
2. Make sure no other tool writes to the output folder at the same time.
3. Rerun `sf data360 retrieve --metadata identity-resolution:<Name> --overwrite`.

## Example output

```text
Retrieve: blocked.
identity-resolution:Individual_Main: PARTIAL_IDENTITY_RESOLUTION_OUTPUT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The ruleset file was written, but the final check of it failed, so it may not match the org. Inspect the .identityResolution.json file and retrieve again with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/PARTIAL_IDENTITY_RESOLUTION_OUTPUT.md
```

## Related codes

- [`PARTIAL_DATA_GRAPH_OUTPUT`](../data-graph/PARTIAL_DATA_GRAPH_OUTPUT.md) — the same situation for a data graph file.
