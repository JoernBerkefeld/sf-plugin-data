# `SEGMENT_DEFINITION_UPDATE_UNQUALIFIED`

> The file changes the existing segment beyond what can be updated: only the label, the description, or appending the IS NOT NULL condition on the selected field. Revert the rest.

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| **Family**   | Segment                                                             |
| **Commands** | `sf data360 deploy`                                                 |
| **Outcome**  | `blocked` — nothing was changed (preview outcome `blocked-changes`) |

## What it means

The segment exists in the org and the file differs from it. The plugin updates an existing segment only in two ways: a new label or description with unchanged SQL, or the same SQL with ` AND <Dmo__dlm>.<Field__c> IS NOT NULL` appended for the selected field. Every other property must stay as it is.

The file changes something else, such as the DMO, the model name, other SQL, or more than one of these at once.

## Why the plugin stops

Other changes to an existing segment have not been verified to update safely in place. The plugin refuses them instead of sending a change whose effect it cannot confirm.

## How to fix

1. Retrieve the current segment with `sf data360 retrieve -m segment:<Name> --output-dir <scratch>` and compare it with your file.
2. Keep only label, description or the allowed SQL condition change, and revert everything else.
3. For other changes, change the segment in the org, or create a new segment under a new name.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked-changes: segment:Example_Segment.
SEGMENT_DEFINITION_UPDATE_UNQUALIFIED: Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.
Hint: The file changes the existing segment beyond what can be updated: only the label, the description, or appending the IS NOT NULL condition on the selected field. Revert the rest.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_DEFINITION_UPDATE_UNQUALIFIED.md
```

## Related codes

- [`SEGMENT_TARGET_NOT_SETTLED`](../segment/SEGMENT_TARGET_NOT_SETTLED.md) — The existing segment is not active yet.
- [`PROCESSING_ACKNOWLEDGEMENT_REQUIRED`](../general/PROCESSING_ACKNOWLEDGEMENT_REQUIRED.md) — An allowed update still needs --allow-processing.
