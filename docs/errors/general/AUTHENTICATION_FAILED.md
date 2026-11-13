# `AUTHENTICATION_FAILED`

> Salesforce rejected the session or the org could not be loaded. Check the org with sf org display, log in again with sf org login web if needed, then rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | General                                                                      |
| **Commands** | `sf data360 retrieve`                                                        |
| **Outcome**  | `failed` — the affected component was not retrieved; the org was not changed |

## What it means

The plugin could not use the authentication of the selected org. Either the Salesforce CLI could not load the org at all (unknown alias, missing or broken auth file), or Salesforce answered a request with HTTP 401 or an expired-session error.

The plugin never handles passwords or tokens itself; it uses the org you logged in to with the Salesforce CLI. No authentication response is printed.

## Why the plugin stops

Without a valid session every further request would fail the same way. The plugin stops for this component instead of guessing whether the data exists.

## How to fix

1. Run `sf org display --target-org <alias>` to see whether the org is still connected.
2. If the session has expired, log in again: `sf org login web --alias <alias>`.
3. Pass the same alias or username with `--target-org` and rerun the command.

## Example output

```text
Retrieve: failed.
calculated-insight:Lifetime_Value__cio: AUTHENTICATION_FAILED: Salesforce API authentication or authorization failed (HTTP 401); no authentication response is disclosed. This component was not retrieved; no files were written for it.
Hint: Salesforce rejected the session or the org could not be loaded. Check the org with sf org display, log in again with sf org login web if needed, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/AUTHENTICATION_FAILED.md
Downloaded calculated-insight: 0
```

## Related codes

- [`TARGET_ORG_REQUIRED`](../general/TARGET_ORG_REQUIRED.md) — no org was selected or configured at all.
- [`REQUEST_FAILED`](../general/REQUEST_FAILED.md) — Salesforce rejected the request for another reason.
- [`INVALID_REQUEST`](../general/INVALID_REQUEST.md) — the plugin refused to build the request before sending it.
