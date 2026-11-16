# `STREAM_CHANGE_NOT_APPLIED`

> Salesforce accepted the stream write, but the stream still differs from the file (Salesforce keeps a CRM stream label). Retrieve the stream; change the rest in Salesforce.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data stream (Salesforce CRM connector)                                       |
| **Commands** | `sf data360 deploy`                                                          |
| **Outcome**  | `created` or `updated` — a notice on the item; the exit status is not failed |

## What it means

Deploy sent the create or the PATCH of a CRM stream, Salesforce answered with success, and the stream became ACTIVE. Read back afterwards, the stream still differs from the file in the parts the notice names.

The known case is the label: Salesforce answers a PATCH of a CRM stream label with HTTP 200 and keeps the old label.

## Why the plugin reports it

The plugin sends the file and lets Salesforce decide. A success answer alone does not prove the change, so the plugin reads the stream back and names every part that did not change instead of reporting a plain success.

## How to fix

1. Retrieve the stream to see what it holds now.
2. Change the label (or the other named part) in Salesforce, or put the org value back into the file so the next deploy reports `unchanged`.

## Example output

```text
Deploy execution: success.
Updated: data-stream:Pricebook_Home; mutation: confirmed-updated.
STREAM_CHANGE_NOT_APPLIED: Salesforce accepted the label change but kept the old label; change it in Salesforce. Retrieve the stream to see what it holds.
```

## Related codes

- [`STREAM_HTTP_ERROR`](../data-stream/STREAM_HTTP_ERROR.md) — Salesforce refused the write, for example a change of `refreshConfig.refreshMode`.
