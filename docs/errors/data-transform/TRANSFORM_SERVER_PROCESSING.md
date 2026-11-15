# `TRANSFORM_SERVER_PROCESSING`

> The transform definition was written and read back, but Data Cloud is still processing it. Check its status in Data Cloud before relying on its output.

|              |                                      |
| ------------ | ------------------------------------ |
| **Family**   | Data transform                       |
| **Commands** | `sf data360 deploy`                  |
| **Outcome**  | informational — the deploy succeeded |

## What it means

The create or update was sent, and the plugin read the transform back by its ID and name. Salesforce still reports the transform as `PROCESSING`. The definition is in place, but the plugin does not wait for processing to finish and makes no claim about the transform run.

## Why the plugin reports it

A written definition is not the same as a finished transform. The notice keeps the two apart so a successful deploy is not read as proof that data has been loaded.

## How to fix

1. No fix is needed for the deploy.
2. Check the transform status in Data Cloud and wait until it is active before relying on its output.
3. Salesforce stores the definition in a normalized form; retrieve the transform to get that form into your file, after which the same deploy reports `unchanged`.

## Example output

```text
Deploy execution: success. No automatic retry or rollback performed.
created data-transform Orders_Copy (server is still processing)
TRANSFORM_SERVER_PROCESSING: Definition written and read back; server is still processing. Computation completion is not established.
Hint: The transform definition was written and read back, but Data Cloud is still processing it. Check its status in Data Cloud before relying on its output.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_SERVER_PROCESSING.md
Deployed: 1 (1 created / 0 updated / 0 failed)
```

## Related codes

- [`TRANSFORM_READBACK_MISMATCH`](../data-transform/TRANSFORM_READBACK_MISMATCH.md) — the transform read back after the write is not the one that was sent.
