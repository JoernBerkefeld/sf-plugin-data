# `INVALID_STREAM_ORG`

> The target org alias or username is empty or not valid for the stream requests. Pass a valid alias or username with -o, then rerun.

|              |                                                                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data stream                                                                                                                              |
| **Commands** | `sf data360 retrieve`, `sf data360 delete`, `sf data360 deploy` (reported there as `DEPLOY_EXECUTION_FAILED` or `DEPLOY_PREVIEW_FAILED`) |
| **Outcome**  | `blocked` on delete — nothing was changed; `failed` on retrieve — no file was written                                                    |

## What it means

Stream writes run through the Salesforce CLI, which needs the target org alias or username. This code means the value was empty, started with `-`, or contained control characters.

## Why the plugin stops

The value is passed as a command-line argument. A value that starts with `-` could be read as an option, so the plugin refuses it before any request.

## How to fix

1. Check the org with `sf org list`.
2. Pass a valid alias or username with `-o <alias>`, or set a default with `sf config set target-org <alias>`.
3. Rerun the command.

## Example output

```text
Retrieve: failed.
data-stream:WebOrders_Order_1a2b3c4d: INVALID_STREAM_ORG: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data stream retrieval did not complete; no write attempted.
Hint: The target org alias or username is empty or not valid for the stream requests. Pass a valid alias or username with -o, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-stream/INVALID_STREAM_ORG.md
Downloaded data-stream: 0
```

## Related codes

- [`TARGET_ORG_REQUIRED`](../general/TARGET_ORG_REQUIRED.md) — no target org was given or found.
