# `VERBATIM_NOT_DEPLOYABLE`

> The named file was retrieved as-is because the plugin cannot represent that object, so it cannot be deployed. Change the object in the org, or select a file the plugin can represent.

|              |                                               |
| ------------ | --------------------------------------------- |
| **Family**   | General                                       |
| **Commands** | `sf data360 deploy`, `sf data360 publish`     |
| **Outcome**  | `blocked` — nothing was deployed or published |

## What it means

Retrieve never refuses an object because the plugin cannot represent it. When the org holds a variant the plugin's file format does not model, retrieve writes the object as Salesforce returned it, at the path its normal file would use. Such a verbatim file looks like this:

```json
{
  "schemaVersion": 1,
  "kind": "dmo",
  "c__dataSpace": "default",
  "identity": { "apiName": "Example__dlm" },
  "verbatim": { "reason": "INVALID_DMO_RESPONSE", "native": { "...": "..." } }
}
```

`reason` is the code of the check the object did not pass. You selected such a file by name, with `-m type:Name` or with an exact `--source-dir` file. The message names its type, name and reason.

## Why the plugin stops

A verbatim file holds the raw read response, not a definition the plugin knows how to send. Deploying it could create or change the object in ways nobody checked. The refusal happens before any call to the org.

A verbatim file inside a selected folder or a Git range (`--changed-since`) is skipped with a warning instead, so the rest of the selection still deploys. Deleting a verbatim file in a Git range still deletes the object by type and name with `sf data360 delete --changed-since`.

## How to fix

1. Leave the file out of the selection, or select its folder so it is skipped with a warning.
2. To deploy the object, change it in the org to a variant the plugin supports, then retrieve it again.
3. Once a newer plugin version supports the variant, retrieve it again; the normal file replaces the verbatim one.

## Example output

```text
Deploy execution: blocked (VERBATIM_NOT_DEPLOYABLE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
VERBATIM_NOT_DEPLOYABLE: The dmo Example__dlm was retrieved as-is (verbatim, reason INVALID_DMO_RESPONSE) because the plugin cannot represent it, so it cannot be deployed or published. Change it in the org, or deploy a file the plugin can represent. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: The named file was retrieved as-is because the plugin cannot represent that object, so it cannot be deployed. Change the object in the org, or select a file the plugin can represent.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/VERBATIM_NOT_DEPLOYABLE.md
```

## Related codes

- [`INVALID_SOURCE`](../general/INVALID_SOURCE.md) — the file is not a valid definition at all.
- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — the selection flags are not valid.
