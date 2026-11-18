# `MAPPING_LABEL_READ_FAILED`

> The Metadata API read of the mapping, needed to compare or change its label, failed, so no label update was sent. Check the org login and the connection, then rerun the deploy.

|              |                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                                                           |
| **Commands** | `sf data360 deploy`                                                                                               |
| **Outcome**  | `blocked` — mutation `not-attempted` before any write; `failed` — mutation `unknown` after a create or pair write |

## What it means

The mapping file states a `spec.label`. The label lives only in the Metadata API record `ObjectSourceTargetMap` (`masterLabel`), so deploy reads that record with `readMetadata`: in the preview and planning step to compare the label, and once more right before the label update, whose pair list it supplies. That read failed (for example a network error or an expired session), or it returned no record or no pairs for the mapping, so no label update was sent.

When the read failed while planning, nothing was written. When it failed right before the label update of a mapping the deploy just created or whose pairs it just changed, those writes stay and the mutation is `unknown`.

## Why the plugin stops

The update must carry every pair the mapping currently has and no other: a pair left out is kept and a pair sent is added. Without a fresh read of the record the plugin cannot build that list, so there is nothing safe to send.

## How to fix

1. Check your org login and the connection.
2. Rerun the deploy: an unchanged pair list is not sent again, only the label.

## Example output

```text
Deploy execution: blocked.
Blocked: mapping:Customer_Home_map; mutation: not-attempted.
MAPPING_LABEL_READ_FAILED: The Metadata API read of the ObjectSourceTargetMap Customer_Home_map_Customer_1794467679481 to compare its label failed, so the label update was not sent. No write attempted; correct the reported check before another attempt.
Hint: The Metadata API read of the mapping, needed to compare or change its label, failed, so no label update was sent. Check the org login and the connection, then rerun the deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_LABEL_READ_FAILED.md
```

## Related codes

- [`MAPPING_LABEL_UPDATE_REJECTED`](../mapping/MAPPING_LABEL_UPDATE_REJECTED.md) — Salesforce refused the label update.
