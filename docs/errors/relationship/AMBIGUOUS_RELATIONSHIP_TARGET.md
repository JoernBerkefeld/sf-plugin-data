# `AMBIGUOUS_RELATIONSHIP_TARGET`

> More than one relationship in the org links the same source and target fields, so the plugin cannot tell which one the file means. Delete the extra one by name, then rerun.

|              |                                          |
| ------------ | ---------------------------------------- |
| **Family**   | Relationship                             |
| **Commands** | `sf data360 deploy`, `sf data360 delete` |
| **Outcome**  | `blocked` — nothing was changed          |

## What it means

The plugin matches a relationship file to the org by its binding: source DMO and field, target DMO and field. The source DMO's relationship list holds two or more relationships with the binding of the file.

## Why the plugin stops

The plugin would have to guess which relationship the file stands for. A wrong guess could leave a duplicate or change the wrong relationship.

## How to fix

1. Retrieve the source DMO's relationships with `sf data360 retrieve -m relationship:<SourceDmo__dlm> --output-dir <scratch>`.
2. Decide which relationship to keep and delete the others with `sf data360 delete -m relationship:<SourceDmo__dlm>:<Name>`.
3. Rerun the command.

## Example output

```text
Deploy preview: blocked (AMBIGUOUS_RELATIONSHIP_TARGET). No deployment executed.
AMBIGUOUS_RELATIONSHIP_TARGET: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: More than one relationship in the org links the same source and target fields, so the plugin cannot tell which one the file means. Delete the extra one by name, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/relationship/AMBIGUOUS_RELATIONSHIP_TARGET.md
```

## Related codes

- [`RELATIONSHIP_NAME_MISMATCH`](../relationship/RELATIONSHIP_NAME_MISMATCH.md) — The binding exists under another name.
