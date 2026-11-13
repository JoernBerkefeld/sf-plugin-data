# `NATIVE_INVENTORY_FAILED`

> Listing the DLOs, DMOs or mappings in the org failed, so nothing was retrieved. Check the org session and permissions in the message, then rerun or select exact type:ApiName members.

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Family**   | General                                                  |
| **Commands** | `sf data360 retrieve`                                    |
| **Outcome**  | `blocked` — no file was written; the org was not changed |

## What it means

When you omit `-m`, or pass a bare type such as `-m dmo`, the plugin first lists every matching component in the org. That listing failed with an error that has no more specific code, typically an HTTP error from Salesforce or an expired session. The message shows the HTTP status when there is one.

## Why the plugin stops

The plugin finishes every listing before it writes any file. A failed listing would make the retrieved set incomplete in a way you could not see, so nothing is written.

## How to fix

1. Check the session: `sf org display --target-org <alias>`.
2. Make sure your user can see Data Cloud objects in the selected data space.
3. Rerun, or retrieve exact members with `-m dmo:<Name__dlm>`, which needs no listing.

## Example output

```text
Retrieve: blocked (NATIVE_INVENTORY_FAILED).
NATIVE_INVENTORY_FAILED: Salesforce API rejected the request (HTTP 403); no response payload is disclosed. Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Listing the DLOs, DMOs or mappings in the org failed, so nothing was retrieved. Check the org session and permissions in the message, then rerun or select exact type:ApiName members.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/NATIVE_INVENTORY_FAILED.md
```

## Related codes

- [`NATIVE_INVENTORY_UNCONFIRMED`](../general/NATIVE_INVENTORY_UNCONFIRMED.md) — the listing answered, but its pages could not be confirmed complete.
- [`MAPPING_INVENTORY_UNCONFIRMED`](../mapping/MAPPING_INVENTORY_UNCONFIRMED.md) — the same for the mapping listing.
- [`NATIVE_RETRIEVE_FAILED`](../general/NATIVE_RETRIEVE_FAILED.md) — a single listed component could not be retrieved.
