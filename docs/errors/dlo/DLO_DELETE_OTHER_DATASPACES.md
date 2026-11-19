# `DLO_DELETE_OTHER_DATASPACES`

> The DLO also belongs to other data spaces, and a delete removes it from all of them. Deploy a shorter c__dataSpace list with --allow-dataspace-removal instead.

|              |                                                                  |
| ------------ | ---------------------------------------------------------------- |
| **Family**   | Data lake object                                                 |
| **Commands** | `sf data360 delete`                                              |
| **Outcome**  | `blocked` — nothing was deleted (preview reports the same block) |

## What it means

The selected DLO belongs to the run's data space and to others, which the message names. A DLO delete (`DELETE /ssot/data-lake-objects/<id>`) removes it from every data space at once.

## Why the plugin stops

Deleting it from the run's data space would also delete it everywhere else, with everything built on it there. The plugin refuses that before any phase of the delete starts.

## How to fix

1. To take the DLO out of one data space only, remove that name from `c__dataSpace` in its file and run `sf data360 deploy --allow-dataspace-removal`.
2. To delete it everywhere, first remove it from the other data spaces that way, then run the delete in the last one.

## Example output

```text
Delete preview: blocked.
Blocked: dlo:Orders__dll; mutation: not-attempted.
DLO_DELETE_OTHER_DATASPACES: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Orders__dll also belongs to the data space dataspace2, and a delete would remove it from all of them. To take it out of one data space only, deploy its file with a shorter c__dataSpace list and --allow-dataspace-removal.
Hint: The DLO also belongs to other data spaces, and a delete removes it from all of them. Deploy a shorter c__dataSpace list with --allow-dataspace-removal instead.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DELETE_OTHER_DATASPACES.md
```

## Related codes

- [`DLO_DATASPACE_REMOVAL_NOT_ALLOWED`](../dlo/DLO_DATASPACE_REMOVAL_NOT_ALLOWED.md) — removing a data space with deploy.
- [`UNSUPPORTED_DLO_DATASPACE`](../dlo/UNSUPPORTED_DLO_DATASPACE.md) — the DLO is not in the run's data space at all.
