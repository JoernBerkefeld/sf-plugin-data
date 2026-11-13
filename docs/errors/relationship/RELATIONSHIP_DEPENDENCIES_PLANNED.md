# `RELATIONSHIP_DEPENDENCIES_PLANNED`

> This batch creates a DMO the relationship uses, so the preview cannot compare the relationship yet. No action is needed; the deploy checks it after the DMO exists.

|              |                                                                             |
| ------------ | --------------------------------------------------------------------------- |
| **Family**   | Relationship                                                                |
| **Commands** | `sf data360 deploy`                                                         |
| **Outcome**  | informational — preview outcome `planned-dependencies`, nothing was changed |

## What it means

The deploy preview holds a relationship together with a DMO the same batch creates, either its source or its target DMO. That DMO does not exist yet, so the relationship list cannot be read.

## Why the plugin reports it

The plugin reports it so you know that the relationship was not compared. It does not claim the relationship will be created or left unchanged.

## How to fix

1. Nothing to fix. Run the deploy without `--preview`: DMOs are written before relationships, and each relationship is checked when its turn comes.
2. Both DMOs must be mapped before Salesforce accepts the relationship; include their mappings in the batch.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned create: dmo:Order__dlm.
Planned planned-dependencies: relationship:Order_CustomerId_map_Customer_Id_1794467679481.
RELATIONSHIP_DEPENDENCIES_PLANNED: Selected DMO creation must settle before relationship comparison; no relationship existence or write outcome is asserted.
Hint: This batch creates a DMO the relationship uses, so the preview cannot compare the relationship yet. No action is needed; the deploy checks it after the DMO exists.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/RELATIONSHIP_DEPENDENCIES_PLANNED.md
```

## Related codes

- [`RELATIONSHIP_HTTP_ERROR`](../relationship/RELATIONSHIP_HTTP_ERROR.md) — Salesforce rejects a relationship whose DMOs are not mapped.
