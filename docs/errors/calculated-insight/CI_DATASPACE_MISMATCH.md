# `CI_DATASPACE_MISMATCH`

> The calculated insight file's c__dataSpace is not the data space of the run. Run with the --dataspace the file names, or correct c__dataSpace, then rerun.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | Calculated insight                                             |
| **Commands** | `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed                                |

## What it means

Every command runs in one data space: `--dataspace`, or `default` when you leave it out. A calculated insight file names its data space in its top-level `c__dataSpace` key; deploy sends it to Salesforce as `dataSpaceName`. This code means the file names another data space than the run's.

## Why the plugin stops

The plugin never filters a selected file out silently. A file of another data space is refused, so a command never changes an insight in a data space you did not ask for.

## How to fix

1. Check `c__dataSpace` in the JSON file.
2. Pass `--dataspace` with the same value, or leave it out when the file says `default`.
3. Deploy files of different data spaces in separate runs.
4. Only if you have more than one data space: to deploy the insight into the run's data space instead, add `--allow-cross-dataspace`. Its name and SQL are translated; see [Deploy from another data space](../../../README.md#deploy-from-another-data-space-only-if-you-have-more-than-one-data-space).

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Data space: dataspace2.
CI_DATASPACE_MISMATCH: ExampleInsight__cio names the data space default in c__dataSpace, but the run's data space is dataspace2. Run the command with --dataspace default, or correct the file. To deploy it into dataspace2 instead, add --allow-cross-dataspace. Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.
Hint: The calculated insight file's c__dataSpace is not the data space of the run. Run with the --dataspace the file names, or correct c__dataSpace, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_DATASPACE_MISMATCH.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`DMO_DATASPACE_MISMATCH`](../dmo/DMO_DATASPACE_MISMATCH.md) — the same check for data model objects.
- [`CI_IDENTITY_CHANGED`](../calculated-insight/CI_IDENTITY_CHANGED.md) — the insight in the org answers with another name or data space.
