# `UNSUPPORTED_SEGMENT_VARIANT`

> Only SQL (DBT) segments on a DMO without refresh schedule, with a 90-day lookback and no parameters fit the segment file. Retrieve writes other segments as-is, and deploy refuses that file.

|              |                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Family**   | Segment                                                                                                      |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`                                                                   |
| **Outcome**  | retrieve: `success` — the segment is written as-is (verbatim) with a warning; deploy: `blocked` for the file |

## What it means

The plugin's segment file holds SQL (DBT) segments: type `DBT` with a list of SQL models, publish interval `NO_REFRESH`, lookback `P90D`, built on a DMO in the default data space, without parameters. The segment uses another type (for example one built in the segment canvas, without DBT configuration), schedule, lookback or source kind, or it has parameters. The SQL itself is not checked; Salesforce decides about it.

## Why the plugin reports it

Create and update send the SQL models with no refresh schedule and send no lookback or parameters. Another value would be silently ignored on deploy. So retrieve writes such a segment as Salesforce returned it (`verbatim.native`, keys sorted) with this code as `verbatim.reason`, and no SQL files; SQL files left from an earlier retrieve are removed. Deploy refuses a file with another value and names the key, for example `spec.publishInterval`.

## How to fix

1. Manage this segment in Data Cloud; a verbatim file records it but cannot be deployed.
2. To deploy it with the plugin, change it in the org to the supported kind and retrieve it again; the normal file and its SQL files replace the verbatim one.

Deploy skips the verbatim file in a folder or Git range and refuses it when it is named (`VERBATIM_NOT_DEPLOYABLE`).

## Example output

```text
Retrieve: success.
Warning: segment:Example_Segment: retrieved as-is (verbatim, reason UNSUPPORTED_SEGMENT_VARIANT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded segment:Example_Segment (retrieved).
```

## Related codes

- [`UNKNOWN_SEGMENT_CONFIGURATION`](../segment/UNKNOWN_SEGMENT_CONFIGURATION.md) — The segment has settings the plugin does not know.
- [`INVALID_SEGMENT_DOCUMENT`](../segment/INVALID_SEGMENT_DOCUMENT.md) — A value is not text the plugin can keep.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
