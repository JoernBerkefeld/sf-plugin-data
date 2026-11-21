# `DMO_PREFIX_MISMATCH`

> A custom DMO name does not match its data space's prefix (ds2_ in dataspace2; no other space's prefix in default). A new DMO is refused, an existing one only warned about.

|              |                                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve`                                       |
| **Outcome**  | deploy of a new custom DMO: `blocked` — nothing was changed; otherwise a warning |

## What it means

This only matters when your org has more than one data space.

Names of custom DMOs are unique in the whole org, whatever their data space. So each name carries the prefix of its data space, as Salesforce does itself for segments and identity resolution rulesets:

- In a data space other than `default`, the name starts with that space's prefix and an underscore, for example `ds2_Order__dlm` in `dataspace2` (prefix `ds2`).
- In `default`, the name does not start with the prefix of another data space.

The prefixes come from the org's list of data spaces, which the command reads once anyway. Only DMOs you make yourself are checked: creationType `Custom` without a namespace. Standard DMOs, their copies in a data space (such as `ds2_Individual__dlm`), DMOs Salesforce generates and packaged DMOs are never checked.

## Why the plugin stops

- **Deploy of a new custom DMO:** refused before the first write of the whole deploy, so the org never gets a name that can clash with another data space.
- **Deploy of an existing custom DMO:** a warning; the deploy goes ahead. The plugin never renames anything in the org.
- **Retrieve:** a warning for every retrieved custom DMO whose name breaks the rule.

## How to fix

1. Rename the custom DMO in the file (`identity.apiName`) and the file itself, for example `data360/dmo/ds2_Order__dlm.dmo-meta.json`.
2. Rename every reference to it in your other files.
3. Rerun the deploy.

An existing custom DMO keeps its name; to follow the rule, create it again under the new name.

## Example output

```text
Deploy execution: blocked (DMO_PREFIX_MISMATCH). No automatic retry or rollback performed.
Data space: dataspace2.
Deployed: 0 (0 created / 0 updated / 0 failed)
DMO_PREFIX_MISMATCH: DMO Order__dlm is new in the data space dataspace2, but its name does not start with ds2_, the prefix of that data space. Name it ds2_Order__dlm in the file and its file name, then rerun. Deployment was refused before any write; nothing was sent to the org. Fix the reported cause, then rerun.
Hint: A custom DMO name does not match its data space's prefix (ds2_ in dataspace2; no other space's prefix in default). A new DMO is refused, an existing one only warned about.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/DMO_PREFIX_MISMATCH.md
```

## Related codes

- [`DMO_DATASPACE_MISMATCH`](../dmo/DMO_DATASPACE_MISMATCH.md) — the DMO file names another data space than the run.
- [`CI_PREFIX_MISMATCH`](../calculated-insight/CI_PREFIX_MISMATCH.md) — the same rule for calculated insights.
