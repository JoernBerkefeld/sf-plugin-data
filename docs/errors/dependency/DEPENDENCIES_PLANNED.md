# `DEPENDENCIES_PLANNED`

> A parent of this item is created earlier in the same deploy, so the preview cannot compare the item yet. No action is needed; the deploy checks it after the parent settles.

|              |                                     |
| ------------ | ----------------------------------- |
| **Family**   | Dependency                          |
| **Commands** | `sf data360 deploy --preview`       |
| **Outcome**  | informational — the preview goes on |

## What it means

The deploy runs in phases: DLOs, DMOs, mappings and relationships first, then identity resolution, calculated insights and Segments. An identity resolution runs before a calculated insight or Segment that uses its unified DMO. This item needs a component that an earlier phase of the same deploy creates (the message names it, for example `dmo:person__dlm` or `identity-resolution:individual_5810`). That component does not exist yet, so the preview lists the item as `planned-dependencies` without saying whether it will be created or updated.

## Why the plugin reports it

Comparing the item against an org that does not hold its parent yet would only report the missing parent. The real comparison runs during the deploy, after the earlier phase has settled.

## How to fix

Nothing is wrong. To see the full comparison in a preview, deploy the parent first, then preview the item again.

## Example output

```text
Deploy preview: success. No deployment executed.
Planned create: dmo:Person__dlm.
Planned planned-dependencies: mapping:Person_map.
Planned planned-dependencies: segment:Audience.
DEPENDENCIES_PLANNED: Selected parent dmo:person__dlm is created earlier in this deploy and must settle before this item is compared; no existence or write outcome is asserted.
Hint: A parent of this item is created earlier in the same deploy, so the preview cannot compare the item yet. No action is needed; the deploy checks it after the parent settles.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCIES_PLANNED.md
```

## Related codes

- [`MAPPING_DEPENDENCIES_PLANNED`](../mapping/MAPPING_DEPENDENCIES_PLANNED.md) — the same notice for a mapping whose DLO or DMO is created in the same deploy.
- [`RELATIONSHIP_DEPENDENCIES_PLANNED`](../relationship/RELATIONSHIP_DEPENDENCIES_PLANNED.md) — the same notice for a relationship.
