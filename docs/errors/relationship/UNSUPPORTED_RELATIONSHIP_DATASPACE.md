# `UNSUPPORTED_RELATIONSHIP_DATASPACE`

> The relationship file's c__dataSpace is not the data space of the run. Run with the --dataspace the file names, or leave it out for the default data space.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Relationship                             |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

Each relationship file names the data space it was retrieved from in its top-level `c__dataSpace` key. The command runs for another data space: the one in `--dataspace`, or `default` when the flag is not set.

The message names the file's data space and the run's.

## Why the plugin stops

Applying a file to another data space than it came from could create or delete the wrong relationship.

## How to fix

1. Rerun with `--dataspace <name>` matching `c__dataSpace` in the file, or without the flag when the file says `default`.

## Example output

```text
Deploy preview: blocked (UNSUPPORTED_RELATIONSHIP_DATASPACE). No deployment executed.
UNSUPPORTED_RELATIONSHIP_DATASPACE: Customer_PartyId_map_Party_Id_1 names the data space default in c__dataSpace, but the run's data space is dataspace2 (--dataspace, default "default"). Run the command with --dataspace default, or correct the file. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The relationship file's c__dataSpace is not the data space of the run. Run with the --dataspace the file names, or leave it out for the default data space.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/UNSUPPORTED_RELATIONSHIP_DATASPACE.md
```

## Related codes

- [`MAPPING_DATASPACE_MISMATCH`](../mapping/MAPPING_DATASPACE_MISMATCH.md) — the same check for mappings.
