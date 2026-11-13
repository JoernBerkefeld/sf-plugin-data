# `IDENTITY_RESOLUTION_ASYNC_DEPENDENTS`

> The selection holds an identity resolution and a graph, calculated insight or Segment that uses its unified DMO, so --async cannot be used. Drop --async, or deploy the dependents in a later run.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | Identity resolution              |
| **Commands** | `sf data360 deploy --async`      |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

`--async` returns as soon as Salesforce accepts an identity resolution create or update, before the ruleset is published. The selection also holds a data graph, calculated insight or Segment that uses a unified or link DMO of that ruleset (its graph root or related object, a CI dependency, or a Segment's `segmentOn` or dependency). The plugin derives these DMO names from the ruleset file: ruleset `Individual_5810` with reconciliation DMO `ssot__Individual__dlm` produces `UnifiedssotIndividual5810__dlm` and `UnifiedLinkssotIndividual5810__dlm`.

## Why the plugin stops

The dependents must not start before the ruleset is published, and with `--async` the deploy never waits for that.

## How to fix

- Remove `--async`; the deploy then waits for the ruleset to be published before it deploys the dependents, or
- deploy the ruleset with `--async` alone, rerun it until it reports `unchanged`, then deploy the dependents.

## Example output

```text
Deploy execution: blocked (IDENTITY_RESOLUTION_ASYNC_DEPENDENTS). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
IDENTITY_RESOLUTION_ASYNC_DEPENDENTS: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The selection holds an identity resolution and a graph, calculated insight or Segment that uses its unified DMO, so --async cannot be used. Drop --async, or deploy the dependents in a later run.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_ASYNC_DEPENDENTS.md
```

## Related codes

- [`INVALID_ASYNC_SCOPE`](../general/INVALID_ASYNC_SCOPE.md) — `--async` without an identity resolution in the selection.
- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — what a rerun reports while an `--async` change is still processing.
