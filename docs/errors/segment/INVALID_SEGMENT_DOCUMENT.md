# `INVALID_SEGMENT_DOCUMENT`

> A segment value is not text the plugin can send (missing, empty, too long, control characters), the models are not a list, or a model name cannot name a SQL file. Retrieve writes such a segment as-is; fix the file for deploy.

|              |                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Family**   | Segment                                                                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`                                                                   |
| **Outcome**  | retrieve: `success` — the segment is written as-is (verbatim) with a warning; deploy: `blocked` for the file |

## What it means

One of the segment's values failed the plugin's format checks: `spec.models` is not a list of `{ name, sql }` entries, or a value that should be text is not text. Deploy also refuses text that is empty where it must not be, longer than 262,144 characters, or with control characters other than tab and line breaks, and names the key path. Each model's SQL is saved in its own file `<Name>.segment.<model>.sql`, so a model name must start with a letter or digit and hold only letters, digits and underscores, and two model names may not differ only in case. The SQL and the model names are otherwise not checked; Salesforce decides about them.

## Why the plugin reports it

The plugin writes segment values exactly as read, without changing SQL bytes or inventing defaults. A segment read from the org whose models cannot be split into SQL files is written as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, and deploy refuses that file.

## How to fix

1. Check the segment's label, description, SQL and model names (the deploy message names the key).
2. Correct the value in the file, or rename the model in the org and retrieve the segment again.

Deploy skips a verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## Example output

```text
Retrieve: success.
Warning: segment:Example_Segment: retrieved as-is (verbatim, reason INVALID_SEGMENT_DOCUMENT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded segment:Example_Segment (retrieved).
```

## Related codes

- [`UNKNOWN_SEGMENT_CONFIGURATION`](../segment/UNKNOWN_SEGMENT_CONFIGURATION.md) — The segment has fields the plugin does not know.
- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — The segment kind is not supported.
