# `UNKNOWN_CI_CONFIGURATION`

> The calculated insight has fields that are missing or unknown to the plugin. Nothing was written or sent; retrieve the pair again and do not add or remove fields.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                            |

## What it means

The plugin checks that each part of the calculated insight has exactly the expected fields. This code means a field is missing or there is a field the plugin does not know, either in the local JSON or in the response from the org.

Deploy, publish and delete report this for a local file as `INVALID_SOURCE`; retrieve reports it for an org response as `CI_ACQUISITION_FAILED`.

## Why the plugin stops

An unknown field could carry configuration that the plugin would silently drop. The plugin stops instead of losing it.

## How to fix

1. Retrieve the calculated insight again with `--overwrite` and do not add or remove JSON fields.
2. If the org response has new fields, the calculated insight cannot be handled by this plugin version.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: calculated-insight:ExampleInsight__cio.
UNKNOWN_CI_CONFIGURATION: Native CI intent, scope, content or dependencies are unqualified.
Hint: The calculated insight has fields that are missing or unknown to the plugin. Nothing was written or sent; retrieve the pair again and do not add or remove fields.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/UNKNOWN_CI_CONFIGURATION.md
```

## Related codes

- [`INVALID_CI_DOCUMENT`](../calculated-insight/INVALID_CI_DOCUMENT.md) — the document shape or values are wrong.
- [`CI_ACQUISITION_FAILED`](../calculated-insight/CI_ACQUISITION_FAILED.md) — how retrieve reports a response it cannot check.
