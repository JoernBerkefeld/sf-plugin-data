# `MAPPING_GENERATED_PAIRS_UNPROVEN`

> The mapping was not saved: its source DLO or target DMO could not be read to leave out the pairs Salesforce generates. Check both objects exist and are readable, then rerun.

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| **Family**   | Mapping                                                |
| **Commands** | `sf data360 retrieve`                                  |
| **Outcome**  | `failed` for this mapping — no file was written for it |

## What it means

A retrieved mapping file lists only the pairs you authored; the pairs Salesforce generates (system fields, key qualifier) are left out. To tell them apart, the plugin reads the mapping's source DLO and target DMO. That read failed, and the message names the objects and the reason.

## Why the plugin stops

A file that still contains generated pairs, or misses an authored one, would change the mapping on the next deploy. Without the objects the plugin cannot decide, so it saves nothing for this mapping.

## How to fix

1. Check that the source DLO and target DMO named in the message exist and that your user can read them.
2. Check the code in parentheses at the end of the message for the specific cause.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
mapping:Customer_Home_map: MAPPING_GENERATED_PAIRS_UNPROVEN: Customer_Home_map was not saved: its source data lake object Customer_Home__dll and target data model object Customer__dlm must be readable to leave out the pairs Salesforce generates (DMO_HTTP_ERROR). Nothing was written for it. Native component retrieval did not complete; no write attempted.
Hint: The mapping was not saved: its source DLO or target DMO could not be read to leave out the pairs Salesforce generates. Check both objects exist and are readable, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_GENERATED_PAIRS_UNPROVEN.md
Downloaded mapping: 0
```

## Related codes

- [`MAPPING_PARENTS_REQUIRED`](../mapping/MAPPING_PARENTS_REQUIRED.md) — the cause shown inside this message when no parent readers exist.
- [`MAPPING_DEPENDENCY_IDENTITY_MISMATCH`](../mapping/MAPPING_DEPENDENCY_IDENTITY_MISMATCH.md) — the source DLO or target DMO read back under another name.
