# `DLO_DATASPACE_REMOVAL_NOT_ALLOWED`

> The DLO belongs to data spaces its c__dataSpace list leaves out. Add them to the list, or rerun with --allow-dataspace-removal to remove the DLO from them.

|              |                                                                  |
| ------------ | ---------------------------------------------------------------- |
| **Family**   | Data lake object                                                 |
| **Commands** | `sf data360 deploy`                                              |
| **Outcome**  | `blocked` — nothing was written (preview reports the same block) |

## What it means

The DLO in the org belongs to data spaces that the `c__dataSpace` list of its file leaves out. Deploying the file as written would remove the DLO from those data spaces, and the deploy was run without `--allow-dataspace-removal`. The message names the data spaces.

## Why the plugin stops

Removing a DLO from a data space takes its data away from everything built on it there: mappings, segments, insights. The plugin does this only when you ask for it.

## How to fix

1. If the DLO should stay in those data spaces, add them to `c__dataSpace` (or retrieve the DLO again).
2. If it should leave them, run `sf data360 deploy --preview --allow-dataspace-removal` to see the change, then deploy with `--allow-dataspace-removal`.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: dlo:Orders__dll.
DLO_DATASPACE_REMOVAL_NOT_ALLOWED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Orders__dll belongs to the data spaces dataspace2 in the org, which c__dataSpace does not list. Removing a DLO from a data space needs --allow-dataspace-removal; otherwise add them to c__dataSpace.
Hint: The DLO belongs to data spaces its c__dataSpace list leaves out. Add them to the list, or rerun with --allow-dataspace-removal to remove the DLO from them.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_REMOVAL_NOT_ALLOWED.md
```

## Related codes

- [`DLO_DATASPACE_NOT_SETTLED`](../dlo/DLO_DATASPACE_NOT_SETTLED.md) — a data space change was sent but not confirmed.
- [`DLO_DELETE_OTHER_DATASPACES`](../dlo/DLO_DELETE_OTHER_DATASPACES.md) — the same protection for a delete.
