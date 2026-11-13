# `SEGMENT_PAIR_MISMATCH`

> The segment's stored criteria and its SQL model disagree in the org, so the plugin cannot tell which one is right. Check the segment in the org, then retrieve again.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

Salesforce keeps the segment's SQL model in two places: as the model itself and inside the criteria text. The plugin decodes the criteria and requires that they hold the same single model, with the same name and SQL. They differ.

## Why the plugin stops

If the two copies disagree, saving one of them could lose the definition Salesforce actually uses. The plugin refuses instead of choosing.

## How to fix

1. Open the segment in the org and check its SQL.
2. Save the segment again in the org so both copies are rewritten, then retrieve it again.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: SEGMENT_PAIR_MISMATCH: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The segment's stored criteria and its SQL model disagree in the org, so the plugin cannot tell which one is right. Check the segment in the org, then retrieve again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_PAIR_MISMATCH.md
Downloaded segment: 0
```

## Related codes

- [`INVALID_SEGMENT_XML`](../segment/INVALID_SEGMENT_XML.md) — The criteria could not be decoded at all.
