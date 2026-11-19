# `DLO_DATASPACE_MEMBERS_UNCONFIRMED`

> The data space member change was sent, but the member list could not be read completely afterwards, so the plugin cannot confirm every member is still there. Check the members in the org before any further deploy.

|              |                                                        |
| ------------ | ------------------------------------------------------ |
| **Family**   | Data lake object                                       |
| **Commands** | `sf data360 deploy`                                    |
| **Outcome**  | `failed` with mutation `unknown` — the change was sent |

## What it means

To add a DLO to a data space, the plugin sends the space's complete member list with the DLO added (one `PUT /ssot/data-spaces/<space>/members`). Whether that PUT adds or replaces is not proven, so afterwards the plugin reads the member list again and checks that every member it had before is still there. This code means that second read could not be completed or held a member the plugin cannot read, after the PUT was already sent.

## Why the plugin stops

The PUT may already have changed the data space. Without a complete read the plugin cannot tell whether a member was dropped, so it does not report the deploy as confirmed.

## How to fix

1. Check the members of the data space named in the message in Data Cloud Setup.
2. Restore any member that is missing.
3. Rerun the deploy once the member list reads normally.

## Example output

```text
Deploy execution: failed. No automatic retry or rollback performed.
Failed: dlo:Orders__dll; mutation: unknown.
DLO_DATASPACE_MEMBERS_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The member change of data space dataspace2 was sent, but its member list then could not be read to its end, so the plugin cannot confirm that every member is still there. Check its members in the org before any further deploy.
Hint: The data space member change was sent, but the member list could not be read completely afterwards, so the plugin cannot confirm every member is still there. Check the members in the org before any further deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_MEMBERS_UNCONFIRMED.md
```

## Related codes

- [`DLO_DATASPACE_MEMBERS_UNREADABLE`](../dlo/DLO_DATASPACE_MEMBERS_UNREADABLE.md) — the same read before any change was sent.
- [`DLO_DATASPACE_MEMBERS_CHANGED`](../dlo/DLO_DATASPACE_MEMBERS_CHANGED.md) — the read worked and a member is missing.
