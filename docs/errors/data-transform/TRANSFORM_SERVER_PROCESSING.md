# `TRANSFORM_SERVER_PROCESSING`

> The transform definition was written and verified, but Data Cloud is still processing it. Check its status in Data Cloud before relying on its output.

|              |                                      |
| ------------ | ------------------------------------ |
| **Family**   | Data transform                       |
| **Commands** | `sf data360 deploy`                  |
| **Outcome**  | informational — the deploy succeeded |

## What it means

The create or update was sent, and the plugin read back a definition that matches your file. Salesforce still reports the transform as `PROCESSING`. The definition is in place, but the plugin does not wait for processing to finish and makes no claim about the transform run.

## Why the plugin reports it

A verified definition is not the same as a finished transform. The notice keeps the two apart so a successful deploy is not read as proof that data has been loaded.

## How to fix

1. No fix is needed for the deploy.
2. Check the transform status in Data Cloud and wait until it is active before relying on its output.
3. Running the same deploy again later reports `unchanged` once nothing differs.

## Example output

```text
Deploy execution: success. No automatic retry or rollback performed.
created data-transform Orders_Copy (server is still processing)
TRANSFORM_SERVER_PROCESSING: Definition independently verified; server is still processing. Computation completion is not established.
Hint: The transform definition was written and verified, but Data Cloud is still processing it. Check its status in Data Cloud before relying on its output.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_SERVER_PROCESSING.md
Deployed: 1 (1 created / 0 updated / 0 failed)
```

## Related codes

- [`TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED`](../data-transform/TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED.md) — the flag that accepts this processing before the write.
