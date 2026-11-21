# `CROSS_DATASPACE_RULESETS_READ_FAILED`

> A file of another data space names an identity resolution output, and the ruleset list that places it could not be read. Nothing was sent; check the org session, then rerun.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | General                                                  |
| **Commands** | `sf data360 deploy --allow-cross-dataspace`              |
| **Outcome**  | `blocked` — nothing was sent to the org, no file written |

## What it means

This only matters when your org has more than one data space.

A file of another data space (for example a data graph on a unified DMO) names an identity resolution output such as `UnifiedssotIndividualT1__dlm`. Its name in the run's data space comes from the org's ruleset list: the one ruleset of the same type there names it. The deploy reads that list once, and the read failed or did not return a list.

## Why the plugin stops

Without the list the output cannot be placed exactly, and a guessed name would point the graph at the wrong object. So the whole deploy is refused before the first write.

## How to fix

1. Check that the org session is valid (`sf org display --target-org <alias>`) and that you have Data Cloud access.
2. Run the deploy again.

## Example output

```text
Deploy preview: blocked (CROSS_DATASPACE_RULESETS_READ_FAILED). No deployment executed.
CROSS_DATASPACE_RULESETS_READ_FAILED: A file names an identity resolution output, and the identity resolution ruleset list that places it could not be read. Nothing was sent; rerun the deploy.
Hint: A file of another data space names an identity resolution output, and the ruleset list that places it could not be read. Nothing was sent; check the org session, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/CROSS_DATASPACE_RULESETS_READ_FAILED.md
```

## Related codes

- [`CROSS_DATASPACE_UNRESOLVED`](../general/CROSS_DATASPACE_UNRESOLVED.md) — the list was read, and an output still cannot be placed.
