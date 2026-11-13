# `PROCESSING_ACKNOWLEDGEMENT_REQUIRED`

> This create or update starts processing in Data Cloud and needs your explicit consent. Check it with --preview, then rerun with --allow-processing.

|              |                                           |
| ------------ | ----------------------------------------- |
| **Family**   | General                                   |
| **Commands** | `sf data360 deploy`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was written           |

## What it means

Creating or changing a Segment, calculated insight, identity resolution or data stream, and publishing a calculated insight, makes Data Cloud process data. For an identity resolution create it also provisions generated output objects. The deploy (or publish) would do one of these, but `--allow-processing` was not passed.

A deploy that changes nothing (`unchanged`) does not need the flag.

## Why the plugin stops

Processing uses org resources and can take a long time, and generated outputs are not removed by the plugin. The flag makes sure such work starts only when you ask for it. In a batch, nothing is written when any item needs the flag.

## How to fix

1. Run the same command with `--preview` to see which items would be created or updated.
2. If that is intended, rerun with `--allow-processing`.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Not attempted: identity-resolution:Individual__dlm; mutation: not-attempted.
PROCESSING_ACKNOWLEDGEMENT_REQUIRED: IR processing and CREATE generated-output provisioning require explicit --allow-processing. No batch writes were attempted.
Hint: This create or update starts processing in Data Cloud and needs your explicit consent. Check it with --preview, then rerun with --allow-processing.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
DEPLOY_EXECUTION_BLOCKED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: At least one item was blocked, so the deploy stopped before or between writes. Read the item lines above for the reason, fix it, then rerun the same deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DEPLOY_EXECUTION_BLOCKED.md
```

## Related codes

- [`TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED`](../data-transform/TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED.md) — the same consent for data transforms.
- [`IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED`](../identity-resolution/IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED.md) — the identity resolution side of this consent.
- [`DEPLOY_EXECUTION_BLOCKED`](../general/DEPLOY_EXECUTION_BLOCKED.md) — the summary code of the blocked batch.
