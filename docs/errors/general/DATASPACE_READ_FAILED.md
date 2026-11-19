# `DATASPACE_READ_FAILED`

> The list of data spaces could not be read completely from the org, so nothing was read or written. Check the org session and Data Cloud access, then rerun.

|              |                                                                     |
| ------------ | ------------------------------------------------------------------- |
| **Family**   | General                                                             |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`     |
| **Outcome**  | `blocked` — nothing was read from, written to or deleted in the org |

## What it means

The command reads the org's data spaces once (`GET /ssot/data-spaces`, page by page) before anything else. That read failed, or its answer was not a complete list: an HTTP error, an answer without `dataSpaces` or `totalSize`, an entry without a name, or fewer names than `totalSize`.

## Why the plugin stops

Without the complete list the plugin cannot tell whether a data space exists, and it never guesses.

## How to fix

1. Read the Salesforce detail in the message, if there is one.
2. Check the session with `sf org display --target-org <alias>` and that the user has Data Cloud access.
3. Rerun the command.

## Example output

```text
Retrieve: blocked (DATASPACE_READ_FAILED).
DATASPACE_READ_FAILED: Salesforce rejected the request (HTTP 403). Salesforce API detail: INSUFFICIENT_ACCESS: You do not have access.
Hint: The list of data spaces could not be read completely from the org, so nothing was read or written. Check the org session and Data Cloud access, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DATASPACE_READ_FAILED.md
```

## Related codes

- [`UNKNOWN_DATASPACE`](../general/UNKNOWN_DATASPACE.md) — the list was read, but a name is not in it.
- [`AUTHENTICATION_FAILED`](../general/AUTHENTICATION_FAILED.md) — the session itself was refused.
