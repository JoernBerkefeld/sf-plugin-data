# `TRANSFORM_PREVIEW_LIMITATIONS`

> This preview only read from the org. Salesforce validation did not run, and a planned create does not prove that the name is free.

|              |                                                   |
| ------------ | ------------------------------------------------- |
| **Family**   | Data transform                                    |
| **Commands** | `sf data360 deploy`                               |
| **Outcome**  | informational — preview only, nothing was changed |

## What it means

A data transform preview reads the org and runs the plugin checks, but it does not call the Salesforce validation endpoint. Validation runs only during a real create. A planned `create` also does not mean no transform with that name exists: the plugin does not look the name up, and Salesforce decides on the create.

## Why the plugin reports it

Preview never sends anything that could change the org, and it should not look more certain than it is. The notice tells you which checks are still pending.

## How to fix

1. No fix is needed.
2. Run the deploy without `--preview` (with `--allow-processing`) to run validation and the actual write.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned create: data-transform:Orders_Copy.
TRANSFORM_PREVIEW_LIMITATIONS: GET-only preview; server validation pending. Explicit create does not prove name absence; the create-only POST arbitrates collisions.
Hint: This preview only read from the org. Salesforce validation did not run, and a planned create does not prove that the name is free.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_PREVIEW_LIMITATIONS.md
```

## Related codes

- [`TRANSFORM_VALIDATION_FAILED`](../data-transform/TRANSFORM_VALIDATION_FAILED.md) — what the real create reports when validation finds issues.
