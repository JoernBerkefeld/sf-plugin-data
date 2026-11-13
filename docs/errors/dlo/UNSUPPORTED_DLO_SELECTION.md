# `UNSUPPORTED_DLO_SELECTION`

> The target org or DLO name passed to a DLO request is not valid. Use a real --target-org alias or username and exact DLO names ending in __dll.

|              |                                            |
| ------------ | ------------------------------------------ |
| **Family**   | Data lake object                           |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy` |
| **Outcome**  | `blocked` — no request was sent            |

## What it means

Before it creates a DLO client, the plugin checks the target org value: it must not be empty, must not start with `-` and must not contain control characters. When a data transform deploy reads the DLOs it depends on, each DLO name must also be a valid `<Name>__dll` name. One of these checks failed.

## Why the plugin stops

These values end up as command-line arguments or URL parts of a request. A value that looks like a flag or contains control characters could change what is sent, so it is refused.

## How to fix

1. Pass `--target-org` with the alias or username of an authenticated org (`sf org list`).
2. For a data transform, check that every DLO it reads is named with its full `__dll` API name.
3. Rerun the command.

## Example output

```text
Deploy execution: blocked (UNSUPPORTED_DLO_SELECTION). No automatic retry or rollback performed.
UNSUPPORTED_DLO_SELECTION: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The target org or DLO name passed to a DLO request is not valid. Use a real --target-org alias or username and exact DLO names ending in __dll.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/UNSUPPORTED_DLO_SELECTION.md
```

## Related codes

- [`INVALID_DLO_NAME`](../dlo/INVALID_DLO_NAME.md) — a DLO name was rejected right before a request.
- [`TARGET_ORG_REQUIRED`](../general/TARGET_ORG_REQUIRED.md) — no target org could be resolved.
- [`UNSUPPORTED_DMO_SELECTION`](../dmo/UNSUPPORTED_DMO_SELECTION.md) — the same check for data model object requests.
