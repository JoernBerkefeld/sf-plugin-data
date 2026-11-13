# `MAPPING_DEPENDENCIES_PLANNED`

> The mapping's source DLO or target DMO is created earlier in this same deploy, so the preview cannot compare the mapping yet. Run the deploy to check it after its parents.

|              |                                     |
| ------------ | ----------------------------------- |
| **Family**   | Mapping                             |
| **Commands** | `sf data360 deploy --preview`       |
| **Outcome**  | informational — the preview goes on |

## What it means

The same deploy also creates the mapping's source DLO or target DMO. Until they exist, the plugin cannot read their fields or look for an existing mapping, so the preview lists the mapping as `planned-dependencies` without saying whether it will be created or updated.

## Why the plugin reports it

Claiming a create or update before the parents exist would be a guess. The real comparison happens during execution, after the parents are confirmed.

## How to fix

Nothing is wrong. To see the full mapping comparison in a preview:

1. Deploy the DLO and DMO first, then preview the mapping on its own, or
2. Run the full deploy; the mapping is compared and checked after its parents settle.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned create: dlo:Customer_Home__dll.
Planned planned-dependencies: mapping:Customer_Home_map.
MAPPING_DEPENDENCIES_PLANNED: Selected parent creation must settle before mapping comparison; no mapping existence or write outcome is asserted.
Hint: The mapping's source DLO or target DMO is created earlier in this same deploy, so the preview cannot compare the mapping yet. Run the deploy to check it after its parents.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DEPENDENCIES_PLANNED.md
```

## Related codes

- [`MAPPING_FIELD_NOT_FOUND`](../mapping/MAPPING_FIELD_NOT_FOUND.md) — a pair names a field missing on the DLO or DMO.
- [`MAPPING_DEPENDENCY_IDENTITY_MISMATCH`](../mapping/MAPPING_DEPENDENCY_IDENTITY_MISMATCH.md) — the source DLO or target DMO read back under another name.
