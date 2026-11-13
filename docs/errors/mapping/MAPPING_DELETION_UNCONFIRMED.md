# `MAPPING_DELETION_UNCONFIRMED`

> The deletion was sent, but the mapping could still be read after the plugin's checks. Do not repeat the delete at once; read the mapping again later to see if it is gone.

|              |                               |
| ------------ | ----------------------------- |
| **Family**   | Mapping                       |
| **Commands** | `sf data360 delete`           |
| **Outcome**  | `failed` — mutation `unknown` |

## What it means

The destructive deployment was reported successful, but over six reads spaced five seconds apart the mapping was still returned by Salesforce.

## Why the plugin stops

Only an independent read showing the mapping absent confirms the deletion. Without it the plugin cannot say whether Salesforce is still processing or the deletion did not take effect.

## How to fix

1. Wait a few minutes.
2. Check whether the mapping is gone: `sf data360 retrieve --metadata mapping:<Name>`.
3. Only if it still exists, run the delete again.

## Example output

```text
Delete: failed.
Failed: mapping:Customer_Home_map; mutation: unknown.
MAPPING_DELETION_UNCONFIRMED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deletion stopped. Inspect unknown outcomes before another attempt; no automatic retry or rollback.
Hint: The deletion was sent, but the mapping could still be read after the plugin's checks. Do not repeat the delete at once; read the mapping again later to see if it is gone.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DELETION_UNCONFIRMED.md
```

## Related codes

- [`MAPPING_DELETE_FAILED`](../mapping/MAPPING_DELETE_FAILED.md) — the destructive deployment of the mapping was not confirmed.
- [`MAPPING_DELETE_SIDE_EFFECT`](../mapping/MAPPING_DELETE_SIDE_EFFECT.md) — the deletion changed more than the selected mapping.
