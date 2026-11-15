# `UNSUPPORTED_TRANSFORM_INPUT`

> The data transform file is not inert JSON, its name is invalid, it has both or neither of definition and definitions, or its data space is not default. Fix the file and rerun.

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Family**   | Data transform                                                               |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`              |
| **Outcome**  | `failed` for retrieve; `blocked` for deploy and delete — nothing was changed |

## What it means

The plugin checks only a few things in the transform input before it sends it, and one of them failed for a `.dataTransform.json` file or for the transform read from the org:

- the content is plain JSON data (no special objects, no circular references, finite numbers);
- the envelope is `schemaVersion: 1`, `kind: data-transform`, `apiVersion: 68.0` with one `definition` object;
- `name` is an API name (a letter, then letters, digits or underscores);
- exactly one of `definition` (one definition, such as STL) or `definitions` (a list, such as DCSQL) is present;
- `dataSpaceName` is `default`.

Everything else in the definition is sent as written, and Salesforce decides whether it is valid.

## Why the plugin stops

Without a valid name and one definition form, the plugin cannot match the file to a transform in the org or send a complete create or update input.

## How to fix

1. Open the file in `data360/dataTransforms/` and check the points above.
2. If the file is damaged, remove it and retrieve the transform again: `sf data360 retrieve --metadata data-transform:<Name>`.

## Example output

```text
Retrieve: failed.
data-transform:Orders_Copy: UNSUPPORTED_TRANSFORM_INPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Transform retrieval did not complete; no org write attempted.
Hint: The data transform file is not inert JSON, its name is invalid, it has both or neither of definition and definitions, or its data space is not default. Fix the file and rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/data-transform/UNSUPPORTED_TRANSFORM_INPUT.md
Downloaded data-transform: 0
```

## Related codes

- [`UNSUPPORTED_TRANSFORM_VARIANT`](../data-transform/UNSUPPORTED_TRANSFORM_VARIANT.md) — the transform comes from a package.
- [`UNSUPPORTED_TRANSFORM_OWNER_OR_STATE`](../data-transform/UNSUPPORTED_TRANSFORM_OWNER_OR_STATE.md) — the transform is not a custom transform.
