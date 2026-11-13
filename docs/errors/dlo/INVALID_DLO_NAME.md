# `INVALID_DLO_NAME`

> The DLO API name is not valid. Use the exact name: a letter first, then letters, digits or underscores, ending in __dll.

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Family**   | Data lake object                                                |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — no request was sent                                 |

## What it means

Just before it builds a request URL, the plugin checks the DLO name again: it must start with a letter, contain only letters, digits and underscores, and end in `__dll`. The name failed that check.

Selectors are normally checked earlier (with `INVALID_SELECTION`), so this code usually means a name from another source, for example the source object named in a mapping or data stream file.

## Why the plugin stops

The name becomes part of the request URL. Refusing anything outside the expected pattern stops a malformed name from reaching a different endpoint.

## How to fix

1. Check the DLO name in the selector and in any file that refers to it (for example `sourceEntityDeveloperName` in a mapping file).
2. Use the full API name with the `__dll` suffix.
3. Rerun the command.

## Example output

```text
Delete: blocked.
Blocked: dlo:Orders__dll; mutation: not-attempted.
INVALID_DLO_NAME: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The DLO API name is not valid. Use the exact name: a letter first, then letters, digits or underscores, ending in __dll.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/INVALID_DLO_NAME.md
```

## Related codes

- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selector itself was rejected.
- [`UNSUPPORTED_DLO_SELECTION`](../dlo/UNSUPPORTED_DLO_SELECTION.md) — the DLO name or target org given to a reader was rejected.
