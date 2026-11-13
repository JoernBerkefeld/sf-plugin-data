# `RETRIEVE_FAILED`

> Retrieval stopped for a reason without a more specific code. Read the message, check the org session and output folder, then rerun the retrieve.

|              |                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                               |
| **Commands** | `sf data360 retrieve`                                                                                 |
| **Outcome**  | `failed` — the affected component, or the whole selection, was not retrieved; the org was not changed |

## What it means

`RETRIEVE_FAILED` is the general code of `sf data360 retrieve`. It appears when an unexpected error stops the retrieve of a Segment, calculated insight, identity resolution, DLO or data graph, or the selection as a whole, and no family code describes it. A missing installation of the Salesforce CLI needed for calculated insight source files can also end here.

## Why the plugin stops

The plugin writes files only for components it retrieved completely. It reports the failure and exits nonzero rather than writing a partial result.

## How to fix

1. Read the message. An HTTP status points at the org, session or permissions.
2. Check the session with `sf org display --target-org <alias>` and the output folder with `--output-dir`.
3. Rerun the command, if needed with fewer selectors to find the one that fails.

## Example output

```text
Retrieve: failed.
segment:High_Value_Customers: RETRIEVE_FAILED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Retrieval stopped for a reason without a more specific code. Read the message, check the org session and output folder, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/RETRIEVE_FAILED.md
Downloaded segment: 0
```

## Related codes

- [`NATIVE_RETRIEVE_FAILED`](../general/NATIVE_RETRIEVE_FAILED.md) — the same for DLO, DMO, mapping and relationship retrieves.
- [`ACQUISITION_FAILED`](../general/ACQUISITION_FAILED.md) — a Metadata API read failed.
- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — writing the file failed.
