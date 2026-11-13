# `INVALID_SOURCE`

> A selected file is not a valid definition for its file type, or its content names a different component than its file name. Fix the file, or retrieve it again, then rerun.

|              |                                                                |
| ------------ | -------------------------------------------------------------- |
| **Family**   | General                                                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete`, `sf data360 publish` |
| **Outcome**  | `blocked` — nothing was deployed, deleted or published         |

## What it means

The plugin found the selected file and read it safely, but the content did not pass validation: it is not strict JSON (or valid paired XML for a calculated insight), a required field is missing or has the wrong type, the identity inside the file does not match the file name, or the file type is not one the command can deploy.

Files written by `sf data360 retrieve` pass this check unless they were edited afterwards.

## Why the plugin stops

The plugin compares the file with the target and sends only what the file describes. A file it cannot fully validate could lead to a wrong comparison or a wrong request.

## How to fix

1. Open the file named by your selection and check it is valid JSON without duplicate keys.
2. Make sure the API name inside the file matches the file name.
3. Compare with a freshly retrieved file: `sf data360 retrieve -m <type>:<ApiName> --output-dir <scratch folder>`.
4. Rerun the command.

## Example output

```text
Deploy execution: blocked (INVALID_SOURCE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_SOURCE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: A selected file is not a valid definition for its file type, or its content names a different component than its file name. Fix the file, or retrieve it again, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_SOURCE.md
```

## Related codes

- [`UNSAFE_SOURCE`](../general/UNSAFE_SOURCE.md) — the file could not be read safely.
- [`DUPLICATE_IDENTITY`](../general/DUPLICATE_IDENTITY.md) — two files describe the same component.
- [`UNSUPPORTED_SEGMENT_XML`](../segment/UNSUPPORTED_SEGMENT_XML.md) — a Segment XML file was selected instead of the JSON file.
