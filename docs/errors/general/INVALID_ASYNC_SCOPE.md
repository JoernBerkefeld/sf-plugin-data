# `INVALID_ASYNC_SCOPE`

> --async works only when the selection contains an identity resolution. Remove --async, or select an identity-resolution file or -m identity-resolution:<Name>.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

`--async` lets an identity resolution create or update return as soon as Salesforce accepts it, instead of waiting until it is published. The selection did not contain any identity resolution, so the flag has nothing to apply to.

## Why the plugin stops

Other families do not have an asynchronous mode. Accepting the flag silently would suggest a behaviour the deploy does not have.

## How to fix

- Remove `--async`, or
- add the identity resolution you meant to deploy, for example `-m identity-resolution:Individual__dlm`.

## Example output

```text
Deploy execution: blocked (INVALID_ASYNC_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_ASYNC_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: --async works only when the selection contains an identity resolution. Remove --async, or select an identity-resolution file or -m identity-resolution:<Name>.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_ASYNC_SCOPE.md
```

## Related codes

- [`INVALID_DRAFT_SCOPE`](../general/INVALID_DRAFT_SCOPE.md) — `--draft` used outside calculated insights.
- [`INVALID_WAIT_TIMEOUT_SCOPE`](../general/INVALID_WAIT_TIMEOUT_SCOPE.md) — `--wait-timeout` used outside a single data graph.
- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — what a rerun reports while an `--async` change is still processing.
