# `NATIVE_INVENTORY_UNCONFIRMED`

> The list of DLOs or DMOs from the org could not be confirmed complete, so nothing was retrieved. Retrieve exact members with -m dmo:<Name> or -m dlo:<Name>, or rerun later.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | General                                                  |
| **Commands** | `sf data360 retrieve`                                    |
| **Outcome**  | `blocked` — no file was written; the org was not changed |

## What it means

The plugin reads the DLO and DMO listings page by page and checks each page: the expected wrapper fields, page links that match the request, a stable total count, valid names, a data space on each entry, no duplicates, and an end within about 2000 entries. `NATIVE_INVENTORY_UNCONFIRMED` means one of those checks failed, so the plugin cannot be sure the list is complete.

## Why the plugin stops

A retrieve of "all DMOs" that silently missed some would look complete when it is not. The plugin refuses the whole inventory instead.

## How to fix

1. Rerun the command; a listing that changed between pages often settles.
2. Retrieve the components you need by exact name: `sf data360 retrieve -m dmo:<Name__dlm> -m dlo:<Name__dll>`.
3. If the org holds more than about 2000 objects of one type, always use exact selectors.

## Example output

```text
Retrieve: blocked (NATIVE_INVENTORY_UNCONFIRMED).
NATIVE_INVENTORY_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: The list of DLOs or DMOs from the org could not be confirmed complete, so nothing was retrieved. Retrieve exact members with -m dmo:<Name> or -m dlo:<Name>, or rerun later.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/NATIVE_INVENTORY_UNCONFIRMED.md
```

## Related codes

- [`NATIVE_INVENTORY_FAILED`](../general/NATIVE_INVENTORY_FAILED.md) — the listing request itself failed.
- [`MAPPING_INVENTORY_UNCONFIRMED`](../mapping/MAPPING_INVENTORY_UNCONFIRMED.md) — the mapping listing could not be confirmed.
