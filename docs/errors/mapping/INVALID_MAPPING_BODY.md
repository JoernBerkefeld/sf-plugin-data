# `INVALID_MAPPING_BODY`

> The mapping write request the plugin built did not have the expected shape, so it was not sent. Check the mapping file's pairs; if the file is valid, report the problem.

|              |                              |
| ------------ | ---------------------------- |
| **Family**   | Mapping                      |
| **Commands** | `sf data360 deploy`          |
| **Outcome**  | `blocked` — nothing was sent |

## What it means

Before a mapping create or update is sent, the plugin checks the request body: exactly a source DLO, a target DMO and a list of pairs, each with only a source and a target field name. The body failed that check.

## Why the plugin stops

A malformed body could create or change a mapping in a way the file does not describe. The check runs before anything is sent, so the org is unchanged.

## How to fix

1. Validate the mapping file: each `fieldMappings` entry has `sourceFieldDeveloperName`, `targetFieldDeveloperName` and optionally `developerName`, nothing else.
2. Rerun with `--preview` to see the planned pairs.
3. If the file is valid and the error repeats, report it with the command you ran.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: mapping:Customer_Home_map; mutation: not-attempted.
INVALID_MAPPING_BODY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The mapping write request the plugin built did not have the expected shape, so it was not sent. Check the mapping file's pairs; if the file is valid, report the problem.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/INVALID_MAPPING_BODY.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_MAPPING_FIELD`](../mapping/INVALID_MAPPING_FIELD.md) — a single field pair breaks the file format.
- [`INVALID_MAPPING_DOCUMENT`](../mapping/INVALID_MAPPING_DOCUMENT.md) — the whole mapping definition breaks the file format.
