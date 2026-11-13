# `PARTIAL_DMO_OUTPUT`

> The DMO file was written but could not be verified afterwards. Check the file under data360/dmo, then rerun the retrieve with --overwrite.

|              |                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Family**   | Data model object                                                                                                            |
| **Commands** | `sf data360 retrieve`, `sf data360 delete`                                                                                   |
| **Outcome**  | `failed` — a file was written; its content is not confirmed (on `delete --field` it is shown as the reason a refresh failed) |

## What it means

A DMO file is written through a temporary copy that is then moved into place. The move happened, but a later step failed: removing the temporary copy, or the final check that the file on disk holds exactly the expected content.

`sf data360 delete --field` uses the same writer to refresh existing DMO files after a confirmed removal; there the refresh line shows this code.

## Why the plugin stops

The plugin reports a file as written only after reading it back. Here it could not confirm the content, so the item is reported as failed instead of clean.

## How to fix

1. Open `data360/dmo/<Name>__dlm.dmo-meta.json` and check that it is complete, valid JSON.
2. Make sure no other tool (editor, sync client, formatter) is writing to the project folder.
3. Rerun `sf data360 retrieve -m dmo:<Name>__dlm --overwrite`.

## Example output

```text
Retrieve: failed.
dmo:Customer__dlm: PARTIAL_DMO_OUTPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The DMO file was written but could not be verified afterwards. Check the file under data360/dmo, then rerun the retrieve with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dmo/PARTIAL_DMO_OUTPUT.md
Downloaded dmo: 0
```

## Related codes

- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — the file changed while it was being written.
- [`PARTIAL_DLO_OUTPUT`](../dlo/PARTIAL_DLO_OUTPUT.md) — the same for data lake object files.
- [`LOCAL_REFRESH_FAILED`](../general/LOCAL_REFRESH_FAILED.md) — a field delete could not refresh a project file.
