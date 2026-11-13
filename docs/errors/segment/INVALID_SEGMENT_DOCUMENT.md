# `INVALID_SEGMENT_DOCUMENT`

> A segment value is not plain text the plugin can save: empty, too long, with control characters, or a model name with unsupported characters. Correct it in the org, then retrieve again.

|              |                                                  |
| ------------ | ------------------------------------------------ |
| **Family**   | Segment                                          |
| **Commands** | `sf data360 retrieve`                            |
| **Outcome**  | `blocked` — nothing was written for this segment |

## What it means

One of the segment's values failed the plugin's format checks: a value that should be text is missing or empty, is longer than 262,144 characters, contains control characters other than tab and line breaks, or the SQL model name does not start with a letter followed by letters, digits and underscores.

## Why the plugin stops

The plugin writes segment values exactly as read, without changing SQL bytes or inventing defaults. A value it cannot keep exactly is refused instead of being altered.

## How to fix

1. Check the segment's label, description, SQL and model name in the org.
2. Correct the value that breaks the rules above.
3. Retrieve the segment again.

## Example output

```text
Retrieve: blocked.
segment:Example_Segment: INVALID_SEGMENT_DOCUMENT: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: A segment value is not plain text the plugin can save: empty, too long, with control characters, or a model name with unsupported characters. Correct it in the org, then retrieve again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/INVALID_SEGMENT_DOCUMENT.md
Downloaded segment: 0
```

## Related codes

- [`UNKNOWN_SEGMENT_CONFIGURATION`](../segment/UNKNOWN_SEGMENT_CONFIGURATION.md) — The segment has fields the plugin does not know.
- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — The segment kind is not supported.
