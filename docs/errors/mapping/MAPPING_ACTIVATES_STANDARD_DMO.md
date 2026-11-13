# `MAPPING_ACTIVATES_STANDARD_DMO`

> This is the first mapping onto a standard DMO, and creating it enables that DMO permanently. Deleting the mapping later does not undo that; continue only if intended.

|              |                                             |
| ------------ | ------------------------------------------- |
| **Family**   | Mapping                                     |
| **Commands** | `sf data360 deploy` (preview and execution) |
| **Outcome**  | informational — the deploy goes on          |

## What it means

The target DMO is a standard DMO that is not enabled yet. When its first mapping is created, Salesforce enables the DMO for good: it gets a category and a generated key qualifier field. The preview names this, and the created item repeats it.

## Why the plugin reports it

Enabling a standard DMO cannot be reversed by deleting the mapping. The plugin tells you before and after so the change is never a surprise.

## How to fix

Nothing is wrong. If you do not want to enable the standard DMO:

1. Remove the mapping file from the deploy, or
2. Map onto a custom DMO instead.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned create: mapping:Customer_Home_map.
Planned field create: Id__c -> ssot__Id__c.
MAPPING_ACTIVATES_STANDARD_DMO: Creating the first mapping onto the standard object ssot__Individual__dlm activates it permanently: it becomes enabled, gets a category and a generated key qualifier field. Deleting the mapping does not undo this.
Hint: This is the first mapping onto a standard DMO, and creating it enables that DMO permanently. Deleting the mapping later does not undo that; continue only if intended.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_ACTIVATES_STANDARD_DMO.md
```

## Related codes

- [`MAPPING_FIELD_TYPES_DIFFER`](../mapping/MAPPING_FIELD_TYPES_DIFFER.md) — notice for pairs whose field data types differ.
- [`MAPPING_TARGET_UNSUPPORTED`](../mapping/MAPPING_TARGET_UNSUPPORTED.md) — the target DMO is of a kind the plugin does not write to.
