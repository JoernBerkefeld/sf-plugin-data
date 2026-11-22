# `CI_SQL_FAILS_SILENTLY`

> The SQL holds something Salesforce accepts on deploy and publish but cannot run, so the insight ends in ERROR a few minutes later without a message. The deploy goes ahead; change the SQL as the warning says.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | Calculated insight               |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | a warning; the deploy goes ahead |

## What it means

Salesforce takes some calculated insight SQL on create and publish without complaint, then fails the insight about three minutes later: its status reads `ERROR` with `CREATE_FAILED` and no message. The deploy reads the SQL file of every selected insight and warns about each of these constructs, with the SQL file, line and column.

Classic insights (`queryDialect` `ANSI_SQL`):

- A table alias in `FROM` or `JOIN`, with or without `AS` (`FROM ssot__Individual__dlm i`).
- A quoted column alias: `AS "cnt__c"`, `"cnt__c"` without `AS`, or `` AS `cnt__c` ``.
- A text literal as a column: `'x' AS lbl__c` or `'x' lbl__c`.
- A `--` comment line, even one that names nothing.

SQL Insights Builder insights (`queryDialect` `DC_SQL`):

- A column alias in backticks: `` AS `cnt__c` ``.

Not warned about, because Salesforce runs them:

- An alias without `AS` after a closing bracket, a field or a number (`COUNT(...) cnt__c`).
- Full object names in front of each field (`ssot__Individual__dlm.ssot__Id__c`).
- In `DC_SQL`: a table alias, a double-quoted alias and a text literal column.
- Text inside quotes and comments that only look like one of the constructs (`'-- x'`).

Block comments (`/* … */`) are not checked. An insight without a `queryDialect`, or with another value, is not checked either.

## Why the plugin reports it

- Salesforce decides what SQL it accepts, so the deploy is never refused for this; it only warns.
- Without the warning, the failure shows up minutes later in Data 360 without any reason.
- The check reads only your files; it sends nothing extra to the org.

## How to fix

1. **Table alias:** drop the alias and write the full object name in front of each field, for example `ssot__Individual__dlm.ssot__Id__c`.
2. **Quoted alias:** write the alias without quotes, for example `AS cnt__c`.
3. **Text literal column:** remove it, or build the insight in the SQL Insights Builder (`DC_SQL`).
4. **Comment line:** remove it.
5. Deploy again; the warning is gone once the SQL has none of the constructs.

## Example output

```text
Deploy preview: success. No deployment executed.
Warning: CI_SQL_FAILS_SILENTLY: data360/calculatedInsights/Spend__cio.calculatedInsight-meta.sql line 2:28: the table alias i of ssot__Individual__dlm in a classic (ANSI_SQL) insight. Salesforce accepts it on deploy and publish, but the insight then ends in ERROR (CREATE_FAILED) without a message; write the full object name in front of each field (ssot__Individual__dlm.Field__c) and drop the alias.
Planned create: calculated-insight:Spend__cio.
```

## Related codes

- [`CI_UNEXPECTED_STATE`](../calculated-insight/CI_UNEXPECTED_STATE.md) — after the write, the insight moved to an unexpected status.
- [`CROSS_DATASPACE_UNRESOLVED`](../general/CROSS_DATASPACE_UNRESOLVED.md) — a name in an insight of another data space cannot be placed.
