# `INVALID_DATASPACE_FIELD`

> The c__dataSpace key of the file is missing or not valid: a data space name (for a data transform, the one its definition names), or for a DLO a list of names without repeats. Correct the file or retrieve it again.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | General                                  |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent to the org  |

## What it means

The top-level key `c__dataSpace` of the file is missing or not valid. A DLO file needs a list of data space names (at least one, none repeated); every other type needs one data space name. A data transform file's `c__dataSpace` must equal its `definition.dataSpaceName` when the definition names one. A name is text without surrounding blanks or control characters.

## Why the plugin stops

Every write is bound to the data space the file names. Without a usable value the plugin cannot tell where the component belongs.

## How to fix

1. Open the file named in the message and look at `c__dataSpace` (the message names the entry).
2. Write the data space names as Salesforce stores them, for example `["default", "dataspace2"]` for a DLO.
3. Or retrieve the component again, which writes the key from the org.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: dlo:Orders__dll.
INVALID_DATASPACE_FIELD: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The DLO file cannot be deployed: c__dataSpace must list at least one data space.
Hint: The c__dataSpace key of the file is missing or not valid: a data space name (for a data transform, the one its definition names), or for a DLO a list of names without repeats. Correct the file or retrieve it again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_DATASPACE_FIELD.md
```

## Related codes

- [`LEGACY_DATASPACE_KEY`](../general/LEGACY_DATASPACE_KEY.md) — the file still uses the old identity.dataSpace key.
- [`UNSUPPORTED_DATASPACE_FILTER`](../general/UNSUPPORTED_DATASPACE_FILTER.md) — an entry is a filtered membership.
- [`UNKNOWN_DATASPACE`](../general/UNKNOWN_DATASPACE.md) — the name is valid but the org has no such data space.
