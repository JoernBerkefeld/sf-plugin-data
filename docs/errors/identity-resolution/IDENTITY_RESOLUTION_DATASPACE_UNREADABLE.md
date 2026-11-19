# `IDENTITY_RESOLUTION_DATASPACE_UNREADABLE`

> The org answered the read of the ruleset without a usable data space (dataSpaceName), so the plugin cannot tell where it is and wrote or changed nothing. Rerun; if it repeats, check the ruleset in Data Cloud.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Identity resolution                                             |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` or a failed item; nothing was written or changed      |

## What it means

The plugin reads a ruleset by name and takes its data space from the answer (`dataSpaceName`) before anything else. This code means the answer named no usable data space.

## Why the plugin stops

Without the ruleset's data space the plugin cannot tell whether the ruleset belongs to the run's data space, so it does not write a file, update or delete it.

## How to fix

1. Rerun the command; a passing service problem clears.
2. If it repeats, check the ruleset in Data Cloud.

## Example output

```text
Retrieve: failed.
IDENTITY_RESOLUTION_DATASPACE_UNREADABLE: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
```

## Related codes

- [`IDENTITY_RESOLUTION_DATASPACE_MISMATCH`](../identity-resolution/IDENTITY_RESOLUTION_DATASPACE_MISMATCH.md) — the ruleset is in another data space than the run.
