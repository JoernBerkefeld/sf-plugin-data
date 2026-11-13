# `UNSUPPORTED_TRANSFORM_INPUT`

> The data transform uses features outside the supported shape: one batch load from a DLO with one field mapped into another DLO. Manage this transform in Data Cloud.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The plugin supports one shape of data transform: a batch transform in the default data space with two nodes, one that loads a single field from an existing DLO and one that writes it with one field mapping into a different existing DLO. The transform read from the org, or an existing local `.dataTransform.json` file in the output folder, contains something else, such as more nodes, joins, filters, several fields, other node settings, or values of an unexpected type.

## Why the plugin stops

The local file has to describe the whole transform. Anything the plugin cannot represent would be dropped or changed on the next deploy, so it refuses instead of saving or sending an incomplete definition.

## How to fix

1. Check the transform in Data Cloud against the supported shape.
2. If it needs more than one load and one output with a single mapped field, keep managing it in Data Cloud.
3. If a local file in `data360/dataTransforms/` is damaged, remove it and retrieve again.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: UNSUPPORTED_TRANSFORM_INPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform uses features outside the supported shape: one batch load from a DLO with one field mapped into another DLO. Manage this transform in Data Cloud.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_INPUT.md
Downloaded data-transform: 0
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_VARIANT`](../data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md) — the transform has extra definitions, schedules or a namespace.
- [`UNSUPPORTED_TRANSFORM_OWNER_OR_STATE`](../data-transform/UNSUPPORTED_TRANSFORM_OWNER_OR_STATE.md) — the transform type, owner or status is not supported.
