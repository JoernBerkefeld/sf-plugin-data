# `CI_VISUAL_DRAFT_WITHOUT_SQL`

> A Visual Builder draft has no SQL in the API until it is published (Salesforce returns a placeholder instead), so it cannot be saved as a file. Publish it in Data Cloud, then retrieve it again.

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Family**   | Calculated insight                                           |
| **Commands** | `sf data360 retrieve`                                        |
| **Outcome**  | `failed` — no files were written for this calculated insight |

## What it means

The calculated insight was built with the Visual Builder in Data Cloud and is still a draft. Until it is published, the API 68 read returns the sentence "SQL expression will be available when you publish the insight" as its `expression`, not SQL. The visual model itself is not part of the API.

## Why the plugin stops

The plugin's file holds the insight's SQL. Writing the placeholder sentence as SQL would produce a file that does not describe the insight and that Salesforce would refuse on deploy.

## How to fix

1. Open the insight in Data Cloud and publish it (Visual Builder: Save and Run). Salesforce then generates its SQL.
2. Retrieve it again. The file holds the generated SQL; deploying it creates a SQL insight with the same result, not a Visual Builder insight.

## Example output

```text
Retrieve: failed.
calculated-insight:ExampleInsight__cio: CI_VISUAL_DRAFT_WITHOUT_SQL: Plugin verification or request completion failed; no Salesforce rejection was confirmed.
Hint: A Visual Builder draft has no SQL in the API until it is published (Salesforce returns a placeholder instead), so it cannot be saved as a file. Publish it in Data Cloud, then retrieve it again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_VISUAL_DRAFT_WITHOUT_SQL.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_NOT_FOUND`](../calculated-insight/CI_NOT_FOUND.md) — the insight does not exist.
