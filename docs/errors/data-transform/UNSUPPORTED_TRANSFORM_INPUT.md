# `UNSUPPORTED_TRANSFORM_INPUT`

> The data transform file is not inert JSON, or its name, definition/definitions, a top-level key, schedule or data space is not one the plugin can send. Fix the file (the message names the key) and rerun.

|              |                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data transform                                                                                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 delete`                                                                                   |
| **Outcome**  | retrieve: `success`, a transform read from the org is written as-is (verbatim) with a warning; deploy and delete: `blocked` — nothing was changed |

## What it means

The plugin checks only a few things in the transform input before it sends it, and one of them failed for a `.dataTransform.json` file or for the transform read from the org:

- the content is plain JSON data (no special objects, no circular references, finite numbers);
- the envelope is `schemaVersion: 1`, `kind: data-transform`, `apiVersion: 68.0` with one `definition` object and, optionally, a `schedule` object;
- `name` is an API name (a letter, then letters, digits or underscores);
- exactly one of `definition` (one definition, such as STL) or `definitions` (a list, such as DCSQL) is present;
- every top-level key of the definition is one the create/update input takes (`name`, `label`, `description`, `type`, `dataSpaceName`, `fullRunFrequency`, `definition`, `definitions`, `parameters`, `tags`, `capabilities`, `currencyIsoCode`, `primarySource`);
- `dataSpaceName`, when present, is `default` (a transform built in the UI on DLOs may have none).

Everything else in the definition is sent as written, and Salesforce decides whether it is valid. On deploy, the message names the key path, for example `definition.futureKey`.

Retrieve keeps a key the input does not take (deploy then refuses the file, naming it) and leaves out a `null` `definition` or `definitions` beside the other one. A transform read from the org that still fails these checks, for example with both `definition` and `definitions`, is written as Salesforce returned it (a verbatim file with this code as reason), which deploy refuses.

## Why the plugin stops

Without a valid name and one definition form, the plugin cannot match the file to a transform in the org or send a complete create or update input.

## How to fix

1. Open the file in `data360/dataTransforms/` and check the points above.
2. Remove a key the message names, unless you want to keep the file for reference only.
3. If the file is damaged, remove it and retrieve the transform again: `sf data360 retrieve --metadata data-transform:<Name>`.

## Example output

```text
Retrieve: success.
Warning: data-transform:Orders_Copy: retrieved as-is (verbatim, reason UNSUPPORTED_TRANSFORM_INPUT) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
Downloaded data-transform:Orders_Copy (retrieved).
```

## Related codes

- [`TRANSFORM_DEPLOY_FAILED`](../data-transform/TRANSFORM_DEPLOY_FAILED.md) — Salesforce refused the transform that was sent.
- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy of the verbatim file.
