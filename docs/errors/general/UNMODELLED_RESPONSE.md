# `UNMODELLED_RESPONSE`

> Retrieve wrote this object as-is because the plugin could not read its answer from the org, and the check gave no more specific reason. Manage the object in Salesforce, or report the output.

|              |                                                                  |
| ------------ | ---------------------------------------------------------------- |
| **Family**   | General                                                          |
| **Commands** | `sf data360 retrieve`                                            |
| **Outcome**  | warning — the object was written as-is (verbatim); not a failure |

## What it means

Retrieve never refuses an object because the plugin cannot represent it. When the projection of a read answer into the plugin's file format fails with a specific code, that code becomes the `reason` of the verbatim file. When the check failed without a code, for example because a value had an unexpected type, the reason is `UNMODELLED_RESPONSE`.

The file holds the read answer as Salesforce returned it:

```json
{
  "schemaVersion": 1,
  "kind": "segment",
  "c__dataSpace": "default",
  "identity": { "apiName": "Example" },
  "verbatim": { "reason": "UNMODELLED_RESPONSE", "native": { "...": "..." } }
}
```

## Why the plugin reports it

The object exists and was read, so retrieve keeps it instead of failing. Deploy cannot send such a file: a folder or Git-range deploy skips it with a warning, and naming it refuses with [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md). Deleting the file in a Git range still deletes the object by type and name.

Read failures (HTTP and connection errors), a missing object, an answer that names another object and an object in another data space are still item failures, never verbatim files.

## How to fix

1. Nothing is required: the file records the object as it is in the org.
2. To deploy the object, change it in the org to a variant the plugin supports, then retrieve it again.
3. If the object looks ordinary, report the output of `--json` so the plugin can learn its shape.

## Example output

```text
Warnings:
segment:Example: retrieved as-is (verbatim, reason UNMODELLED_RESPONSE) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.
```

## Related codes

- [`VERBATIM_NOT_DEPLOYABLE`](../general/VERBATIM_NOT_DEPLOYABLE.md) — deploy refuses a named verbatim file.
