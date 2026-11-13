# `NATIVE_PARENT_SETTLEMENT_UNCONFIRMED`

> A parent DLO or DMO was written but could not be confirmed ready, so dependent items were not deployed. Wait, check the parent with deploy --preview, then rerun.

|              |                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                            |
| **Commands** | `sf data360 deploy`                                                                                |
| **Outcome**  | `failed`, mutation `unknown` — the parent may have been changed; items after it were not attempted |

## What it means

On the native route, the plugin deploys a DLO or DMO and then reads it back until it shows the requested definition and is ready (for example `ACTIVE`), before it deploys mappings or relationships that depend on it. That read-back did not confirm the parent, either because it never reached the expected state in the polling window or because the read failed.

## Why the plugin stops

Deploying a mapping or relationship onto a parent that is not ready, or not what the file describes, can fail halfway or bind to the wrong definition. The plugin stops at the parent instead.

## How to fix

1. Wait a few minutes; Data Cloud may still be processing the parent.
2. Run the same deploy with `--preview`. A parent that now shows `unchanged` is ready.
3. Rerun the deploy; the parent reports `unchanged` and the dependent items continue.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: unknown.
NATIVE_PARENT_SETTLEMENT_UNCONFIRMED: Selected parent did not independently confirm its requested definition and family-specific readiness; dependent deployment stopped.
Hint: A parent DLO or DMO was written but could not be confirmed ready, so dependent items were not deployed. Wait, check the parent with deploy --preview, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/NATIVE_PARENT_SETTLEMENT_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
Deployed: 0 (0 created / 0 updated / 1 failed)
```

## Related codes

- [`DEPENDENCIES_PLANNED`](../dependency/DEPENDENCIES_PLANNED.md) — how a preview reports items whose parents an earlier phase creates.
- [`MAPPING_TARGET_NOT_SETTLED`](../mapping/MAPPING_TARGET_NOT_SETTLED.md) — a mapping's target DMO was not ready.
- [`DEPLOY_EXECUTION_FAILED`](../general/DEPLOY_EXECUTION_FAILED.md) — the general deploy failure.
