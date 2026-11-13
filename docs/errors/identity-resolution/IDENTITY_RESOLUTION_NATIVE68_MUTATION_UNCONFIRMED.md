# `IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED`

> The ruleset write was sent, but its result could not be confirmed. Do not resend it blindly; rerun the same deploy with --preview to see the current state.

|              |                                                                   |
| ------------ | ----------------------------------------------------------------- |
| **Family**   | Identity resolution                                               |
| **Commands** | `sf data360 deploy`                                               |
| **Outcome**  | `failed` — the ruleset may have been changed (mutation `unknown`) |

## What it means

The plugin sent the create or update for the ruleset. Afterwards it reads the ruleset until it is `PUBLISHED` (or back in its earlier state) with the settings from your file and verified generated objects. That confirmation did not happen: the time or read budget ran out, the answer did not name this ruleset, or the settings read back differ from the file.

The reason is shown in brackets in the message, for example `deadline-exhausted` or `read-budget-exhausted`. Publishing can take several minutes.

## Why the plugin stops

After a write, a retry or rollback could act on a state the plugin cannot see. The plugin stops the batch and leaves the decision to you.

## How to fix

1. Wait a few minutes, then rerun the same deploy with `--preview`.
2. `unchanged` means the ruleset settled as written. `IDENTITY_RESOLUTION_NOT_SETTLED` means it is still publishing; wait and check again.
3. If the preview plans another change, inspect the ruleset in Data Cloud before deploying again.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: identity-resolution:Individual_Main; mutation: unknown.
IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED: IR write acknowledged; settlement unconfirmed (deadline-exhausted). Stop the batch; inspect the exact target. No retry or rollback was performed.
Hint: The ruleset write was sent, but its result could not be confirmed. Do not resend it blindly; rerun the same deploy with --preview to see the current state.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED.md
Mutation may have occurred. Inspect target before any further attempt.
```

## Related codes

- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — shown on a rerun while the ruleset is still publishing.
- [`IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED`](../identity-resolution/IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED.md) — the failure came before anything was sent.
