# `INVALID_REQUEST`

> The plugin refused to build the Salesforce request from these inputs. Check --target-org, --api-version and the selected names, and that the org uses an https instance URL.

|              |                                                                                    |
| ------------ | ---------------------------------------------------------------------------------- |
| **Family**   | General                                                                            |
| **Commands** | `sf data360 retrieve`                                                              |
| **Outcome**  | `failed` — no request was sent for the affected component; the org was not changed |

## What it means

Before any request leaves the machine, the plugin checks it: the API version must be a plain number such as `68.0`, the org must have a plain `https` instance URL, the request path must not contain encoded separators, control characters or other ambiguous parts, and some write routes accept only API 68. `INVALID_REQUEST` means one of those checks failed, so the request was never sent.

The usual causes are an empty target org value, an unexpected API version, or a component name with unusual characters.

## Why the plugin stops

A request that could be read in two ways could reach a different resource than intended. The plugin refuses it rather than sending it.

## How to fix

1. Pass `--target-org` with a valid alias or username.
2. Use `--api-version auto` or a plain version such as `68.0`.
3. Check the selector names for spaces, `%`, `\` or `#`.
4. Rerun the command.

## Example output

```text
Retrieve: failed.
calculated-insight:Lifetime_Value__cio: INVALID_REQUEST: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The plugin refused to build the Salesforce request from these inputs. Check --target-org, --api-version and the selected names, and that the org uses an https instance URL.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_REQUEST.md
Downloaded calculated-insight: 0
```

## Related codes

- [`AUTHENTICATION_FAILED`](../general/AUTHENTICATION_FAILED.md) — the org session could not be used.
- [`REQUEST_FAILED`](../general/REQUEST_FAILED.md) — the request was sent and Salesforce rejected it.
