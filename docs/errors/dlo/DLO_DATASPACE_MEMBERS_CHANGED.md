# `DLO_DATASPACE_MEMBERS_CHANGED`

> After the DLO was added, the data space no longer lists members it had before. Check its members in the org and restore the missing ones before any further deploy.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Data lake object                                              |
| **Commands** | `sf data360 deploy`                                           |
| **Outcome**  | `failed` with mutation `unknown` — the member change was sent |

## What it means

To add a DLO to a data space, the plugin sends the data space's complete member list with the DLO added (one `PUT /ssot/data-spaces/<space>/members`). Afterwards it reads the member list again: every member it had right before the PUT must still be listed, plus the DLO. This code means some of them are missing; the message names them. Whether this PUT adds to the list or replaces it is not proven, which is why the plugin checks.

## Why the plugin stops

A data space that lost members no longer sees their data, and everything built on them there is affected. The plugin stops so nothing else is changed on top of it.

## How to fix

1. Read the member list of the data space named in the message in Data Cloud Setup.
2. Add the missing DLOs back to the data space.
3. Deploy again only after the members are back.

## Example output

```text
Deploy execution: failed (DEPLOY_EXECUTION_FAILED). No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: unknown.
DLO_DATASPACE_MEMBERS_CHANGED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Data space dataspace2 no longer lists Other__dll after Orders__dll was added. Check its members in the org and restore them before any further deploy.
Hint: After the DLO was added, the data space no longer lists members it had before. Check its members in the org and restore the missing ones before any further deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_MEMBERS_CHANGED.md
```

## Related codes

- [`DLO_DATASPACE_MEMBERS_UNREADABLE`](../dlo/DLO_DATASPACE_MEMBERS_UNREADABLE.md) — the member list could not be read before the change.
- [`DLO_DATASPACE_NOT_SETTLED`](../dlo/DLO_DATASPACE_NOT_SETTLED.md) — the DLO did not list the planned data spaces.
