# `PARTIAL_DLO_OUTPUT`

> The DLO file was written but could not be verified afterwards. Check the file under data360/dlo, then rerun the retrieve with --overwrite.

|              |                                                             |
| ------------ | ----------------------------------------------------------- |
| **Family**   | Data lake object                                            |
| **Commands** | `sf data360 retrieve`                                       |
| **Outcome**  | `failed` — a file was written; its content is not confirmed |

## What it means

A retrieve writes each DLO file through a temporary copy and then moves it into place. The move happened, but a later step failed: removing the temporary copy, or the final check that the file on disk holds exactly the expected content.

The file under `data360/dlo/<Name>__dll.dlo-meta.json` may be complete, or another process may have changed it in the meantime.

## Why the plugin stops

The plugin only reports a retrieve as done when it has read the file back and confirmed it. Here it could not, so it reports the item as failed instead of claiming a clean result.

## How to fix

1. Open the file and check that it is complete, valid JSON.
2. Make sure no other tool (editor, sync client, formatter) is writing to the project folder.
3. Rerun the retrieve with `--overwrite` to write it again.

## Example output

```text
Retrieve: failed.
dlo:Orders__dll: PARTIAL_DLO_OUTPUT: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Native component retrieval did not complete; no write attempted.
Hint: The DLO file was written but could not be verified afterwards. Check the file under data360/dlo, then rerun the retrieve with --overwrite.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/PARTIAL_DLO_OUTPUT.md
Downloaded dlo: 0
```

## Related codes

- [`OUTPUT_CHANGED`](../general/OUTPUT_CHANGED.md) — the file changed while it was being written.
- [`PARTIAL_DMO_OUTPUT`](../dmo/PARTIAL_DMO_OUTPUT.md) — the same for data model object files.
