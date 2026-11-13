# `CI_PUBLICATION_UNCONFIRMED`

> The publish request was sent but the plugin could not confirm the calculated insight is ACTIVE. Do not resend; run publish with --preview to check its state.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 publish`                                           |
| **Outcome**  | `failed` — publication may have happened (`mutation: unknown`) |

## What it means

Publish sent one request to publish the draft, then read the org again (at most 12 reads one second apart, within 120 seconds) to confirm the calculated insight is ACTIVE with the expected content. This code means that confirmation did not succeed.

The calculated insight may or may not be published.

## Why the plugin stops

A response alone does not prove the publication. The plugin does not resend the request or roll anything back.

## How to fix

1. Do not repeat the request directly.
2. Run `sf data360 publish --source-dir <pair member> --preview`: `unchanged` means it is ACTIVE.
3. If it is still processing, wait and check again.

## Example output

```text
Publish: failed.
failed: ExampleInsight__cio; mutation: unknown.
CI_PUBLICATION_UNCONFIRMED: CI publication may have occurred; no replay or rollback was performed.
Hint: The publish request was sent but the plugin could not confirm the calculated insight is ACTIVE. Do not resend; run publish with --preview to check its state.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_PUBLICATION_UNCONFIRMED.md
```

## Related codes

- [`CI_SETTLEMENT_TIMEOUT`](../calculated-insight/CI_SETTLEMENT_TIMEOUT.md) — the follow-up reads ran out of time.
- [`CI_ADMISSION_FAILED`](../calculated-insight/CI_ADMISSION_FAILED.md) — the publish was stopped before anything was sent.
