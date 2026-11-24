# `INVALID_OPTION`

> A library call got options the Salesforce CLI would refuse while parsing its flags, so nothing was read or sent. Fix the options named in the message, then call again.

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Family**   | General                                                                    |
| **Commands** | `runDeploy` and `runDelete` of `sf-plugin-data/api`                        |
| **Outcome**  | thrown as `OptionError` (`exitCode` 2) — no envelope, nothing read or sent |

## What it means

`runDeploy` and `runDelete` take the flags of `sf data360 deploy` and `sf data360 delete` as options. A few combinations the CLI refuses while it parses the command line, before the command runs (exit code 2, no envelope). The library calls refuse the same options the same way: they throw an `OptionError` whose `code` is `INVALID_OPTION` and whose message uses the CLI's wording.

- `changedSince` together with `metadata` (deploy and delete) or `sourceDir` (deploy).
- A deploy `wait` that is not a whole number of at least 1.
- A deploy `apiVersion` that is neither `auto` nor a version like `68.0`.

Every other refusal comes back as an envelope with `status` `blocked` and its own code.

## Why the plugin stops

The options contradict each other or cannot be a flag value, so there is no run whose result could be reported.

## How to fix

1. Read the message: it names the options.
2. Drop one of the options that exclude each other, or pass a valid value, then call again.

## Example output

```text
OptionError: --changed-since=HEAD cannot also be provided when using --metadata
```

## Related codes

- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — a selection the command itself refuses, reported in the envelope.
