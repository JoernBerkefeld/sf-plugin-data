# `TRANSFORM_PREVIEW_LIMITATIONS`

> This preview only read from the org. Salesforce validation did not run; create or update was chosen by name from the current list of transforms.

|              |                                                   |
| ------------ | ------------------------------------------------- |
| **Family**   | Data transform                                    |
| **Commands** | `sf data360 deploy`                               |
| **Outcome**  | informational — preview only, nothing was changed |

## What it means

A data transform preview reads the full list of transforms, finds the one named in the file (ignoring letter case) and compares it: none found is a planned `create`, one found is `update` or `unchanged`. It does not call the Salesforce validation endpoint; validation runs only during a real create. If the org changes between the preview and the deploy, the deploy looks the name up again and Salesforce decides on the write.

## Why the plugin reports it

Preview never sends anything that could change the org, and it should not look more certain than it is. The notice tells you which checks are still pending.

## How to fix

1. No fix is needed.
2. Run the deploy without `--preview` to run validation and the actual write.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned create: data-transform:Orders_Copy.
TRANSFORM_PREVIEW_LIMITATIONS: GET-only preview; server validation pending. The target was chosen by name from the current transform list; Salesforce decides at deploy time.
Hint: This preview only read from the org. Salesforce validation did not run; create or update was chosen by name from the current list of transforms.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_PREVIEW_LIMITATIONS.md
```

## Related codes

- [`TRANSFORM_VALIDATION_FAILED`](../data-transform/TRANSFORM_VALIDATION_FAILED.md) — what the real create reports when validation finds issues.
- [`TRANSFORM_TARGET_NOT_RESOLVED`](../data-transform/TRANSFORM_TARGET_NOT_RESOLVED.md) — the name matches more than one transform.
