# `SEGMENT_PUBLISH_REJECTED`

> Salesforce refused the publish request; its answer is in the message. Fix the cause it names, then run the publish again; nothing was resent.

|              |                                                                      |
| ------------ | -------------------------------------------------------------------- |
| **Family**   | Segment                                                              |
| **Commands** | `sf data360 publish`                                                 |
| **Outcome**  | `failed` — mutation `rejected`: Salesforce did not start the publish |

## What it means

The publish request was answered with a 4xx error (other than 429), or with `success: false`. Salesforce decides whether a segment can be published now, also while it is processing or counting, and its text is shown in the message.

## Why the plugin stops

The plugin does not check the segment status before the publish; Salesforce decides. A refused request is not repeated.

## How to fix

1. Read the Salesforce detail in the message.
2. If the segment is still processing or counting, wait until it is `ACTIVE` and run the publish again.
3. Otherwise fix the cause Salesforce names, then rerun.

## Example output

```text
Publish: failed.
failed: Example_Segment; mutation: rejected.
SEGMENT_PUBLISH_REJECTED: Salesforce API rejected the request (HTTP 400); no response payload is disclosed. Salesforce API detail: <code>: <text>. Salesforce refused the publish; nothing was resent.
Hint: Salesforce refused the publish request; its answer is in the message. Fix the cause it names, then run the publish again; nothing was resent.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PUBLISH_REJECTED.md
```

## Related codes

- [`SEGMENT_PUBLISH_UNCONFIRMED`](../segment/SEGMENT_PUBLISH_UNCONFIRMED.md) — The answer to the publish is unknown.
