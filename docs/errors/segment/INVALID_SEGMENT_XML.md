# `INVALID_SEGMENT_XML`

> The segment's stored criteria text could not be decoded as the XML the plugin expects. Check the segment's criteria in the org; it cannot be saved as it is.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

Besides the SQL model, Salesforce stores the segment criteria as escaped XML text. The plugin decodes that text to compare it with the SQL model. The text was not a string, contained a raw `<` or an `&` that is not a valid entity, or encoded a character that is not allowed.

## Why the plugin stops

The criteria text and the SQL model must describe the same segment. If the criteria cannot be decoded, the plugin cannot confirm that and refuses to save a possibly incomplete definition.

## How to fix

1. Open the segment in the org and check its criteria.
2. Save the segment again so Salesforce rewrites the criteria, then retrieve it again.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: INVALID_SEGMENT_XML: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The segment's stored criteria text could not be decoded as the XML the plugin expects. Check the segment's criteria in the org; it cannot be saved as it is.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/INVALID_SEGMENT_XML.md
Downloaded segment: 0
```

## Related codes

- [`SEGMENT_PAIR_MISMATCH`](../segment/SEGMENT_PAIR_MISMATCH.md) — The criteria decode but disagree with the SQL model.
