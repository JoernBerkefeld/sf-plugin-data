# `CI_VISUAL_DRAFT_WITHOUT_SQL`

> A Visual Builder draft has no SQL in the API until it is published (Salesforce returns a placeholder instead). Retrieve wrote it as-is without a SQL file, and deploy refuses that file; publish it in Data Cloud, then retrieve it again.

|              |                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                                 |
| **Commands** | `sf data360 retrieve`                                                                              |
| **Outcome**  | `success` — the insight file is written as-is (verbatim) with a warning; it is not an item failure |

## What it means

The calculated insight was built with the Visual Builder in Data Cloud and is still a draft. Until it is published, the API 68 read returns the sentence "SQL expression will be available when you publish the insight" as its `expression`, not SQL. The visual model itself is not part of the API.

## Why the plugin reports it

The plugin's normal file holds the insight's SQL, and the placeholder sentence is not SQL. So retrieve writes the insight GET as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, and no SQL file. A SQL file left from an earlier retrieve stays in place and is reported.

## How to fix

1. Open the insight in Data Cloud and publish it (Visual Builder: Save and Run). Salesforce then generates its SQL.
2. Retrieve it again. The normal file and its SQL file replace the verbatim one; deploying them creates a SQL insight with the same result, not a Visual Builder insight.

Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## Example output

```text
Retrieve: success.
Warning: calculated-insight:ExampleInsight__cio: retrieved as-is (verbatim, reason CI_VISUAL_DRAFT_WITHOUT_SQL) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded calculated-insight:ExampleInsight__cio (retrieved).
```

## Related codes

- [`CI_NOT_FOUND`](../calculated-insight/CI_NOT_FOUND.md) — the insight does not exist.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
