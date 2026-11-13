# `UNSUPPORTED_RELATIONSHIP_DATASPACE`

> The file's data space does not match the command's data space. Set --dataspace to the identity.dataSpace of the file, or leave it out for the default data space.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Relationship                             |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

Each relationship file records the data space it was retrieved from in `identity.dataSpace`. The command runs for another data space: the one in `--dataspace`, or `default` when the flag is not set.

## Why the plugin stops

Applying a file to another data space than it came from could create or delete the wrong relationship.

## How to fix

1. Rerun with `--dataspace <name>` matching `identity.dataSpace` in the file, or without the flag when the file says `default`.

## Example output

```text
Deploy preview: blocked (UNSUPPORTED_RELATIONSHIP_DATASPACE). No deployment executed.
UNSUPPORTED_RELATIONSHIP_DATASPACE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The file's data space does not match the command's data space. Set --dataspace to the identity.dataSpace of the file, or leave it out for the default data space.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/UNSUPPORTED_RELATIONSHIP_DATASPACE.md
```

## Related codes

- [`RELATIONSHIP_DATASPACE_COLLISION`](../relationship/RELATIONSHIP_DATASPACE_COLLISION.md) — The data space conflict on retrieve.
