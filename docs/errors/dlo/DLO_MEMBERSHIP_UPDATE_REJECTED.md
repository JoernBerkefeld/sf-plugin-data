# `DLO_MEMBERSHIP_UPDATE_REJECTED`

> Salesforce answered the data space member change without success, so the DLO data spaces were not changed. Read the message, fix the cause and rerun.

|              |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Family**   | Data lake object                                                                              |
| **Commands** | `sf data360 deploy`                                                                           |
| **Outcome**  | `failed` with mutation `rejected` when it is the first write of the item, otherwise `unknown` |

## What it means

The plugin added a DLO to a data space (`PUT …/members`) or removed it (`DELETE …/members?memberNames=…`), and Salesforce answered without success: a PUT without `success: "true"` or with `errors`, or a DELETE whose `results` do not all report `success: true`.

## Why the plugin stops

The answer says the change did not happen, so the plugin does not wait for it or continue as if it had.

## How to fix

1. Read the message and check the data space and the DLO in Data Cloud Setup.
2. Fix the cause (for example a data space the user cannot change), then rerun the deploy.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: rejected.
DLO_MEMBERSHIP_UPDATE_REJECTED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete.
Hint: Salesforce answered the data space member change without success, so the DLO data spaces were not changed. Read the message, fix the cause and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_MEMBERSHIP_UPDATE_REJECTED.md
```

## Related codes

- [`DLO_DATASPACE_NOT_SETTLED`](../dlo/DLO_DATASPACE_NOT_SETTLED.md) — the change was accepted but not confirmed.
- [`DLO_HTTP_ERROR`](../dlo/DLO_HTTP_ERROR.md) — Salesforce answered with an HTTP error instead.
