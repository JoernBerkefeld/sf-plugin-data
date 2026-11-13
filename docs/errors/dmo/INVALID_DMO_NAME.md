# `INVALID_DMO_NAME`

> The DMO API name is not valid. Use the exact name: a letter first, then letters, digits or underscores, ending in __dlm.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data model object                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — no request was sent                                 |

## What it means

Just before it builds a request URL, the plugin checks the DMO name again: it must start with a letter, contain only letters, digits and underscores, and end in `__dlm`. The name failed that check.

Selectors are checked earlier (with `INVALID_SELECTION`), so this code usually means a name from another source, for example the target object in a mapping or relationship file.

## Why the plugin stops

The name becomes part of the request URL. Refusing anything outside the expected pattern keeps a malformed name from reaching a different endpoint.

## How to fix

1. Check the DMO name in the selector and in any file that refers to it (for example `targetEntityDeveloperName` in a mapping file).
2. Use the full API name with the `__dlm` suffix.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked. No automatic retry or rollback performed.
Blocked: dmo:Customer__dlm; mutation: not-attempted.
INVALID_DMO_NAME: Plugin verification or request completion failed; no Salesforce rejection was confirmed. No write attempted; correct the reported check before another attempt.
Hint: The DMO API name is not valid. Use the exact name: a letter first, then letters, digits or underscores, ending in __dlm.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/INVALID_DMO_NAME.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selector itself was rejected.
- [`INVALID_DLO_NAME`](../dlo/INVALID_DLO_NAME.md) — the same check for data lake object names.
