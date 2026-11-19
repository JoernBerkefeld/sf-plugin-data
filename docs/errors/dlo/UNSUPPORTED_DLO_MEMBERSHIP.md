# `UNSUPPORTED_DLO_MEMBERSHIP`

> A data space membership of the DLO carries more than its name (such as a record filter), which the plugin does not model. The DLO is written as-is; change it in the org.

|              |                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------ |
| **Family**   | Data lake object                                                                           |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                            |
| **Outcome**  | retrieve: the DLO is written as-is (verbatim) with a warning; deploy and delete: `blocked` |

## What it means

A DLO lists its data spaces in `dataSpaceInfo`. One entry carries more than a `name` and `label`, for example a record filter of that membership. The plugin does not model such a membership yet.

## Why the plugin stops

Writing the file without the extra keys would lose the filter, and a later deploy could change which records the data space sees. Retrieve keeps the DLO exactly as Salesforce returned it instead, and deploy and delete refuse to act on it.

## How to fix

1. Change the membership in Data Cloud Setup if the filter is not wanted.
2. Otherwise manage this DLO in Setup until the plugin supports filtered memberships.

## Example output

```text
Retrieve: success.
Downloaded dlo:Orders__dll (retrieved).
Warning: dlo:Orders__dll: retrieved as-is (verbatim, reason UNSUPPORTED_DLO_MEMBERSHIP) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Hint: A data space membership of the DLO carries more than its name (such as a record filter), which the plugin does not model. The DLO is written as-is; change it in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_MEMBERSHIP.md
```

## Related codes

- [`UNSUPPORTED_DATASPACE_FILTER`](../general/UNSUPPORTED_DATASPACE_FILTER.md) — a filtered membership written in a DLO file.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — a file retrieved as-is is named in a deploy.
