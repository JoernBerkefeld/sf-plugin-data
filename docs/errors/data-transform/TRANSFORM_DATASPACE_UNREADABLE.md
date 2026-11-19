# `TRANSFORM_DATASPACE_UNREADABLE`

> The plugin could not read the data space of the transform from the org (SOQL on MktDataTransform), so nothing was retrieved, changed or deleted. Check the org login and the message, then rerun.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data transform                                                  |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` or `failed` — nothing was changed                     |

## What it means

A transform GET without `dataSpaceName` (one built on DLOs, or one with `definitions`) does not say which data space the transform belongs to. The plugin then reads the org's transform records once with SOQL over the command's own connection (`SELECT Id, DataSpace.Name FROM MktDataTransform`, matched by the transform's record ID only, because the record's `Name` is its label). This code means that read failed, was not complete, or did not hold the transform.

## Why the plugin stops

Without the data space the plugin cannot tell whether the transform belongs to the run's data space, so it does not retrieve, update or delete it rather than guess.

## How to fix

1. Check that the target org login works and that the user can query MktDataTransform.
2. Rerun the command; read the Salesforce API detail in the message if it repeats.

## Example output

```text
Retrieve: failed.
data-transform:Example_Transform: TRANSFORM_DATASPACE_UNREADABLE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The plugin could not read the data space of the transform from the org (SOQL on MktDataTransform), so nothing was retrieved, changed or deleted. Check the org login and the message, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/TRANSFORM_DATASPACE_UNREADABLE.md
Downloaded data-transform: 0
```

## Related codes

- [`TRANSFORM_DATASPACE_MISMATCH`](../data-transform/TRANSFORM_DATASPACE_MISMATCH.md) — the transform is in another data space than the run.
