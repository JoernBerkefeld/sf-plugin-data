# `INVALID_CI_SCOPE`

> The calculated insight request used an unsupported API version, data space name or option. Use --api-version auto or 68.0 and a valid data space name.

|              |                                                                                       |
| ------------ | ------------------------------------------------------------------------------------- |
| **Family**   | Calculated insight                                                                    |
| **Commands** | `sf data360 retrieve`, `sf data360 deploy`, `sf data360 publish`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was sent                                                          |

## What it means

Calculated insight requests are built only for a supported API version and a usable data space name, with only the supported request options. This code means one of these did not hold. Commands check the version and data space earlier, so this is a last guard before a request is built.

## Why the plugin stops

Requests for other versions have not been verified, so the plugin does not send them.

## How to fix

1. Omit `--api-version` or use `auto` or `68.0`.
2. Pass `--dataspace` with the exact name of a data space of the org, or leave it out for `default`.
3. Rerun the command.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: INVALID_CI_SCOPE: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The calculated insight request used an unsupported API version, data space name or option. Use --api-version auto or 68.0 and a valid data space name.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/INVALID_CI_SCOPE.md
Downloaded calculated-insight: 0
```

## Related codes

- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — the command-level check of version and data space.
