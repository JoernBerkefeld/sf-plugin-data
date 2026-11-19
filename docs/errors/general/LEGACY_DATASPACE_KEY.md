# `LEGACY_DATASPACE_KEY`

> The file still has identity.dataSpace, which the plugin no longer reads. Move the value to the top-level c__dataSpace key, or retrieve the component again.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | General                                  |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent to the org  |

## What it means

The selected file has `identity.dataSpace`. The data space of a plugin file now sits in the top-level key `c__dataSpace`: a string for most types, a list for a DLO. The plugin is pre-alpha, so old files are not migrated; the old key is refused.

## Why the plugin stops

Reading the old key silently would leave the file in two shapes. Refusing it names the one place to change.

## How to fix

1. Remove `identity.dataSpace` from the file.
2. Add the top-level key `c__dataSpace` with the same value (for a DLO, a list such as `["default"]`).
3. Or retrieve the component again with `sf data360 retrieve`, which writes the new key.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: dlo:Orders__dll.
LEGACY_DATASPACE_KEY: Plugin verification or request completion failed; no Salesforce rejection was confirmed. The DLO file cannot be deployed: identity.dataSpace is the old place of the data space; move it to the top-level key c__dataSpace, or retrieve the component again.
Hint: The file still has identity.dataSpace, which the plugin no longer reads. Move the value to the top-level c__dataSpace key, or retrieve the component again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/LEGACY_DATASPACE_KEY.md
```

## Related codes

- [`INVALID_DATASPACE_FIELD`](../general/INVALID_DATASPACE_FIELD.md) — the new key is there but not valid.
- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — a selected file is not valid for its type.
