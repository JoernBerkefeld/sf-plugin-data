# `SEGMENT_TARGET_UNQUALIFIED`

> The fresh check of the target segment did not allow a create or an update. Read the segment code printed with it, fix that cause, and preview the deploy again.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Right before the write, the deploy previews the segment again or reads the existing segment again. The fresh preview was blocked, or the read failed or returned an incomplete segment. The code of the fresh preview, when there is one, is printed on the next lines.

## Why the plugin stops

The write is sent only when a fresh check of the target allows it.

## How to fix

1. Read the second segment code printed for the same item, if any, and follow its page.
2. Run `sf data360 deploy --source-dir <file> --preview` again.

## Example output

```text
Deploy execution: blocked (DEPLOY_EXECUTION_BLOCKED). No automatic retry or rollback performed.
Blocked: segment:Example_Segment; mutation: not-attempted.
SEGMENT_TARGET_UNQUALIFIED: Segment deployment was not attempted. Resolve input, scope, effects or target qualification.
Hint: The fresh check of the target segment did not allow a create or an update. Read the segment code printed with it, fix that cause, and preview the deploy again.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_TARGET_UNQUALIFIED.md
Deployed: 0 (0 created / 0 updated / 0 failed)
```

## Related codes

- [`SEGMENT_CREATE_AND_TARGET_UNQUALIFIED`](../segment/SEGMENT_CREATE_AND_TARGET_UNQUALIFIED.md) — A frequent reason of the fresh preview.
- [`SEGMENT_TARGET_NOT_SETTLED`](../segment/SEGMENT_TARGET_NOT_SETTLED.md) — Another reason of the fresh preview.
