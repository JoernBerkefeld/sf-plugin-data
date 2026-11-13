# `UNSUPPORTED_SEGMENT_XML`

> Segment XML files cannot be deployed. Select the segment's .segment.json file instead; retrieve one with sf data360 retrieve -m segment:Name if you do not have it.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The deploy was given a `.marketSegmentDefinition-meta.xml` file directly. Segments are deployed only from the plugin's `data360/segments/<Name>.segment.json` file. Inside a selected folder such XML files are skipped; this code is reported only when one is selected by itself.

## Why the plugin stops

The XML file does not hold everything the plugin needs to compare and deploy a segment safely.

## How to fix

1. Retrieve the segment with `sf data360 retrieve -m segment:<Name>`.
2. Deploy the resulting file with `sf data360 deploy --source-dir data360/segments/<Name>.segment.json --preview`, then without `--preview` and with `--allow-processing`.

## Example output

```text
Deploy preview: blocked (UNSUPPORTED_SEGMENT_XML). No deployment executed.
UNSUPPORTED_SEGMENT_XML: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: Segment XML files cannot be deployed. Select the segment's .segment.json file instead; retrieve one with sf data360 retrieve -m segment:Name if you do not have it.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/UNSUPPORTED_SEGMENT_XML.md
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — The .segment.json file itself is not valid.
