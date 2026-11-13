# `LOCAL_REFRESH_FAILED`

> The fields were deleted in the org, but some project files were not refreshed. Do not repeat the delete; run sf data360 retrieve with --overwrite for the DMO and its mappings.

|              |                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Family**   | General                                                                                                      |
| **Commands** | `sf data360 delete --field`                                                                                  |
| **Outcome**  | `failed` (exit code 1) — the field deletion in the org stays confirmed; only the local refresh is incomplete |

## What it means

After a field-level delete is confirmed, the plugin rewrites the existing DMO and mapping files under `--output-dir` (default: current folder) from fresh reads of the org. At least one of those files could not be refreshed. The message lists each file with its own code, for example `OUTPUT_FAILED`, `OUTPUT_CHANGED` or `UNSAFE_PATH`.

Files that did not exist locally are not created, and no file is deleted.

## Why the plugin stops

The org change is already done and cannot be repeated. The plugin keeps the confirmed result, reports the files it could not refresh and exits nonzero, so you know the project is out of date.

## How to fix

1. Do not run the delete again.
2. Refresh the files: `sf data360 retrieve -m dmo:<Name__dlm> -m mapping:<ApiName> --overwrite`.
3. If the listed code is `UNSAFE_PATH`, check the file for links or a wrong location first.

## Example output

```text
Delete: failed.
dropped pair Email -> Email__c in mapping Customer_Map
deleted field Email__c from dmo Customer__dlm
refreshed /work/project/data360/dmo/Customer__dlm.dmo-meta.json
refresh failed (OUTPUT_FAILED): /work/project/data360/mapping/Customer_Map.mapping-meta.json
LOCAL_REFRESH_FAILED: The field(s) Email__c were deleted from Customer__dlm in the org, but this project file was not refreshed: /work/project/data360/mapping/Customer_Map.mapping-meta.json (OUTPUT_FAILED). Do not repeat the delete; refresh with sf data360 retrieve and --overwrite.
Hint: The fields were deleted in the org, but some project files were not refreshed. Do not repeat the delete; run sf data360 retrieve with --overwrite for the DMO and its mappings.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/LOCAL_REFRESH_FAILED.md
```

## Related codes

- [`LOCAL_FILE_REMOVAL_FAILED`](../general/LOCAL_FILE_REMOVAL_FAILED.md) — local cleanup after a whole-component delete.
- [`OUTPUT_FAILED`](../general/OUTPUT_FAILED.md) — the most common per-file reason.
- [`INVALID_FIELD_DELETE_SELECTION`](../general/INVALID_FIELD_DELETE_SELECTION.md) — the flag rules of field-level delete.
