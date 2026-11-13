# `DEPENDENCY_IDENTITY_UNSUPPORTED`

> A selected component, or one it refers to, has an unsupported type, a data space other than default, or an invalid API name. Fix the reference, then rerun.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Dependency                                 |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve` |
| **Outcome**  | `blocked` — nothing was changed or written |

## What it means

Every component in a dependency-ordered selection, and every component it refers to, must be a DMO, DLO, segment, calculated insight or identity resolution ruleset in the `default` data space with a plain API name. One of them is not.

During retrieve this code also appears when the component read from the org carries a different name than the one selected.

## Why the plugin stops

The plugin orders and checks components by type, data space and exact API name. A reference it cannot place could point at the wrong component.

## How to fix

1. Check the references in the selected files (for example `spec.dependencies` of a segment or calculated insight).
2. Use exact API names in the default data space.
3. For retrieve, use the exact API name (including letter case) in `--metadata`.
4. Rerun.

## Example output

```text
Deploy execution: blocked (DEPENDENCY_IDENTITY_UNSUPPORTED). No automatic retry or rollback performed.
DEPENDENCY_IDENTITY_UNSUPPORTED: Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: A selected component, or one it refers to, has an unsupported type, a data space other than default, or an invalid API name. Fix the reference, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_IDENTITY_UNSUPPORTED.md
```

## Related codes

- [`DEPENDENCY_CLOSURE_UNSUPPORTED`](../dependency/DEPENDENCY_CLOSURE_UNSUPPORTED.md) — the dependencies of a DMO could not be checked.
