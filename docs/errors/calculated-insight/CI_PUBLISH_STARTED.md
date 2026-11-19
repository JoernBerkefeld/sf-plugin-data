# `CI_PUBLISH_STARTED`

> With --async the publish was sent and Salesforce accepted it; the command did not wait until the calculated insight is ACTIVE. Run publish with --preview later: unchanged means it is ACTIVE.

|              |                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ |
| **Family**   | Calculated insight                                                                   |
| **Commands** | `sf data360 publish`                                                                 |
| **Outcome**  | `processing` — outcome `publishing`, mutation `acknowledged-processing`; exit code 0 |

## What it means

`--async` was set, so the plugin sent the one request that publishes the insight (`draft: false`), Salesforce accepted it, and the command returned at once. The insight was not read afterwards, so it is not yet confirmed to be ACTIVE with the file.

## Why the plugin reports it

The result of the publish is not known yet. It is neither a success nor a failure, and the request is never resent.

## How to fix

1. Do not repeat the publish just because of this message.
2. Later, run `sf data360 publish -d <the same file> --preview`: `unchanged` means the insight is ACTIVE with the file.
3. To wait for ACTIVE instead, run the publish without `--async`.

## Example output

```text
Publish: processing.
publishing: ExampleInsight__cio; mutation: acknowledged-processing.
CI_PUBLISH_STARTED: Salesforce accepted the publish; it was sent without waiting until the insight is ACTIVE (--async). It was not resent; run publish with --preview later to check.
Hint: With --async the publish was sent and Salesforce accepted it; the command did not wait until the calculated insight is ACTIVE. Run publish with --preview later: unchanged means it is ACTIVE.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_PUBLISH_STARTED.md
```

## Related codes

- [`CI_PUBLICATION_UNCONFIRMED`](../calculated-insight/CI_PUBLICATION_UNCONFIRMED.md) — without `--async`, the follow-up reads could not confirm ACTIVE.
