# `IDENTITY_RESOLUTION_DELETION_UNCONFIRMED`

> The delete request was sent, but the absence of the ruleset could not be confirmed. Do not resend it; preview the delete or retrieve the ruleset to see whether it still exists.

|              |                                                                       |
| ------------ | --------------------------------------------------------------------- |
| **Family**   | Identity resolution                                                   |
| **Commands** | `sf data360 delete`                                                   |
| **Outcome**  | `failed` — the ruleset may or may not be deleted (mutation `unknown`) |

## What it means

The plugin sent one delete request for the ruleset and then read it back by ID and by name until both reads report it absent. That did not happen within the time and read budget, or a read showed the ruleset in a state other than `DELETING` or changed in an unexpected way.

Salesforce may still be deleting the ruleset, the delete may have failed on the server, or the ruleset may already be gone.

## Why the plugin stops

Once a delete has been sent, sending it again or rolling anything back could act on a state the plugin cannot see. The plugin reports the unknown result and stops.

## How to fix

1. Wait a few minutes, then run `sf data360 delete --metadata identity-resolution:<Name> --preview`. An `unchanged` result means the ruleset is gone.
2. Or check the ruleset in Data Cloud, or retrieve it again.
3. Only if it still exists and is no longer `DELETING`, run the delete again without `--preview`.

## Example output

```text
Delete: failed.
Failed: identity-resolution:Individual_Main; mutation: unknown.
IDENTITY_RESOLUTION_DELETION_UNCONFIRMED: IR deletion may have occurred; owner absence is unconfirmed. No replay, fallback or rollback was performed.
Hint: The delete request was sent, but the absence of the ruleset could not be confirmed. Do not resend it; preview the delete or retrieve the ruleset to see whether it still exists.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_DELETION_UNCONFIRMED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED`](../identity-resolution/IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED.md) — the delete stopped before it was sent.
- [`IDENTITY_RESOLUTION_NOT_SETTLED`](../identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md) — shown while the ruleset is still deleting.
