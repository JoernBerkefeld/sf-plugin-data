# `DLO_DATASPACE_MEMBERS_UNREADABLE`

> The member list of a data space the DLO joins could not be read completely, or holds a member the plugin cannot read (such as a filter). Nothing was changed; check the data space in the org.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Data lake object                |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was written |

## What it means

To add a DLO to a data space, the plugin reads that data space's complete member list and sends it back with the DLO added (one `PUT /ssot/data-spaces/<space>/members`). The list is complete only when its distinct member names equal the `totalSize` it states. This code means the list could not be read to its end, was not in the expected form, states another count than it lists, lists a member twice or in a state other than ACTIVE or PROCESSING, or holds a member with a key other than `memberName`, `memberLabel` and `status` (such as a record filter). In an org whose `default` data space states one member more than it lists (seen live), the plugin therefore cannot add a DLO to `default`.

## Why the plugin stops

The PUT carries the whole member list. A member the plugin could not read, or whose filter it would leave out, could be dropped or changed, so nothing is sent.

## How to fix

1. Check the data space named in the message in Data Cloud Setup.
2. If a member has a filter, add the DLO to that data space in Setup for now.
3. Rerun the deploy once the member list reads normally.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: dlo:Orders__dll.
DLO_DATASPACE_MEMBERS_UNREADABLE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The member list of data space dataspace2 holds a member with the key filter (such as a filter), which the plugin does not read, so it was not changed.
Hint: The member list of a data space the DLO joins could not be read completely, or holds a member the plugin cannot read (such as a filter). Nothing was changed; check the data space in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_DATASPACE_MEMBERS_UNREADABLE.md
```

## Related codes

- [`UNSUPPORTED_DATASPACE_FILTER`](../general/UNSUPPORTED_DATASPACE_FILTER.md) — a filter in the DLO file itself.
- [`DLO_DATASPACE_NOT_SETTLED`](../dlo/DLO_DATASPACE_NOT_SETTLED.md) — the change was sent but not confirmed.
