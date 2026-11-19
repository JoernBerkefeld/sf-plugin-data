# `UNSUPPORTED_DATASPACE_FILTER`

> A c__dataSpace entry is a filtered membership ({name, filter}), which the plugin does not deploy yet. Use the plain data space name, or set the filter in the org.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | General                                  |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent to the org  |

## What it means

An entry of the `c__dataSpace` list of a DLO file is an object `{ "name": …, "filter": … }`: a membership that limits which records of the DLO the data space sees. The plugin recognises the shape but does not deploy it yet.

## Why the plugin stops

Whether a filter written this way reaches Salesforce and reads back the same has not been proven live. Sending it could change which records a data space sees, so the plugin stops instead.

## How to fix

1. Replace the entry with the plain data space name, for example `"dataspace2"`.
2. Set the filter in Data Cloud Setup for now.
3. Rerun the deploy.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: dlo:Orders__dll.
UNSUPPORTED_DATASPACE_FILTER: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The DLO file cannot be deployed: c__dataSpace[1] is a filtered membership, which the plugin does not deploy yet.
Hint: A c__dataSpace entry is a filtered membership ({name, filter}), which the plugin does not deploy yet. Use the plain data space name, or set the filter in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/UNSUPPORTED_DATASPACE_FILTER.md
```

## Related codes

- [`INVALID_DATASPACE_FIELD`](../general/INVALID_DATASPACE_FIELD.md) — any other invalid c__dataSpace value.
