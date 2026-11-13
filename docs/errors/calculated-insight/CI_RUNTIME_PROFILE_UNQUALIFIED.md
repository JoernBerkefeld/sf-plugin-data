# `CI_RUNTIME_PROFILE_UNQUALIFIED`

> The calculated insight is packaged or has run, schedule or source details the plugin cannot handle for this command. Nothing was written or sent; manage it in Data 360.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was written or changed                                            |

## What it means

Besides its definition, the native read returns profile details: package origin, query dialect, schedule, schedule time zone, schedule history, last run, and a link to a source calculated insight. This code means one of them is outside what the plugin accepts.

Retrieve accepts run history and a `SYSTEM_MANAGED` schedule, but refuses packaged calculated insights (`isFromPackage: true`), a query dialect other than ANSI SQL, a schedule time zone, schedule history or a source link. Deploy, publish and delete accept only calculated insights that have never run, have no errors and the schedule `NOT_SCHEDULED`.

## Why the plugin stops

These details are not part of the artifact. Whether calculated insights with them can be changed safely has not been verified, so the plugin does not write them.

## How to fix

1. Check the calculated insight in Data 360: package origin, schedule and run history.
2. A packaged calculated insight cannot be handled by the plugin.
3. For deploy, publish and delete, use a calculated insight that has never run and is not scheduled.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_RUNTIME_PROFILE_UNQUALIFIED: The calculated insight has a package origin, query dialect, schedule time zone, schedule history or source-CI link that the artifact cannot represent; no files were written.
Hint: The calculated insight is packaged or has run, schedule or source details the plugin cannot handle for this command. Nothing was written or sent; manage it in Data 360.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_RUNTIME_PROFILE_UNQUALIFIED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_CONFIGURATION_UNQUALIFIED`](../calculated-insight/CI_CONFIGURATION_UNQUALIFIED.md) — a setting in the definition is not supported.
- [`CI_ADMISSION_FAILED`](../calculated-insight/CI_ADMISSION_FAILED.md) — how deploy, publish and delete report a failed check.
