# `MAPPING_PARENTS_REQUIRED`

> The plugin had no way to read the mapping's source DLO and target DMO, so it could not leave out generated pairs. This is a plugin fault; report it with the command you ran.

|              |                                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| **Family**   | Mapping                                                                          |
| **Commands** | `sf data360 retrieve` (inside the message of `MAPPING_GENERATED_PAIRS_UNPROVEN`) |
| **Outcome**  | `failed` for this mapping — no file was written for it                           |

## What it means

Retrieving a mapping needs readers for its source DLO and target DMO. They were not provided, so the plugin could not identify the pairs Salesforce generates. You see this code in parentheses at the end of a `MAPPING_GENERATED_PAIRS_UNPROVEN` message.

## Why the plugin stops

Without those reads the plugin cannot tell authored pairs from generated ones, and a wrong file would change the mapping on the next deploy.

## How to fix

1. Rerun the retrieve with the latest plugin version.
2. If it repeats, report it with the exact command; this is not caused by your org or files.

## Example output

```text
Retrieve: failed.
mapping:Customer_Home_map: MAPPING_GENERATED_PAIRS_UNPROVEN: Customer_Home_map was not saved: its source data lake object Customer_Home__dll and target data model object Customer__dlm must be readable to leave out the pairs Salesforce generates (MAPPING_PARENTS_REQUIRED). Nothing was written for it. Native component retrieval did not complete; no write attempted.
Hint: The mapping was not saved: its source DLO or target DMO could not be read to leave out the pairs Salesforce generates. Check both objects exist and are readable, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_GENERATED_PAIRS_UNPROVEN.md
Downloaded mapping: 0
```

## Related codes

- [`MAPPING_GENERATED_PAIRS_UNPROVEN`](../mapping/MAPPING_GENERATED_PAIRS_UNPROVEN.md) — the retrieve could not read the parents to drop generated pairs.
