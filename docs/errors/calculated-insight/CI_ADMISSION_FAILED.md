# `CI_ADMISSION_FAILED`

> The plugin's checks of the calculated insight pair, target or dependencies did not pass, so nothing was sent. Run the command with --preview, fix the input or target, then rerun.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                |

## What it means

Before deploy, publish or delete sends anything, the plugin reads the local XML/JSON pair, the calculated insight in the org (native and Metadata API), and the DMO it depends on, and checks that they fit together. This code means one of those checks failed. Typical reasons:

- the calculated insight is absent and `--draft` was not given (deploy creates only drafts), or it is ACTIVE while `--draft` was given, or DRAFT without `--draft`;
- the pair changes more than the SQL expression of an existing calculated insight;
- the target has run history, a schedule or another profile the plugin does not write;
- the DMO `ssot__DeviceApplicationEngagement__dlm` or its fields do not qualify;
- for publish and delete, the calculated insight in the org does not match the local pair;
- the org or the inputs changed between the checks.

If Salesforce returned an error, the message carries the Salesforce detail.

## Why the plugin stops

Each write is sent at most once and is not rolled back. The plugin therefore only writes when the input, the target and its dependencies are all confirmed to be in the expected state.

## How to fix

1. Run the same command with `--preview` to see the planned outcome.
2. For a new calculated insight, add `--draft` to deploy; use `sf data360 publish` to make it ACTIVE.
3. Retrieve the calculated insight again and compare it with your pair: only the SQL expression may differ.
4. Check that the calculated insight has never run and has the schedule `NOT_SCHEDULED`.
5. Check the DMO and its `ssot__DeviceId__c` and `ssot__SoftwareApplicationId__c` fields in the target org.
6. Rerun the command.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: calculated-insight:ExampleInsight__cio.
CI_ADMISSION_FAILED: Native CI intent, scope, content or dependencies are unqualified.
Hint: The plugin's checks of the calculated insight pair, target or dependencies did not pass, so nothing was sent. Run the command with --preview, fix the input or target, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_ADMISSION_FAILED.md
```

## Related codes

- [`CI_MUTATION_UNCONFIRMED`](../calculated-insight/CI_MUTATION_UNCONFIRMED.md) — the deploy was sent, but its result could not be confirmed.
- [`CI_PUBLICATION_UNCONFIRMED`](../calculated-insight/CI_PUBLICATION_UNCONFIRMED.md) — the publish was sent, but its result could not be confirmed.
- [`CI_DELETION_UNCONFIRMED`](../calculated-insight/CI_DELETION_UNCONFIRMED.md) — the delete was sent, but its result could not be confirmed.
- [`CI_NON_EXPRESSION_CHANGE`](../calculated-insight/CI_NON_EXPRESSION_CHANGE.md) — one of the checks behind this code.
- [`CI_RUNTIME_PROFILE_UNQUALIFIED`](../calculated-insight/CI_RUNTIME_PROFILE_UNQUALIFIED.md) — one of the checks behind this code.
