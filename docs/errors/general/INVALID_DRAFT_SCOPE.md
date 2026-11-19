# `INVALID_DRAFT_SCOPE`

> --draft applies only to calculated insights at API auto or 68.0. Select only calculated insights and drop other API versions.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 deploy`              |
| **Outcome**  | `blocked` — nothing was deployed |

## What it means

`--draft` creates or edits a calculated insight as a draft without publishing it. The deploy was refused because at least one of these was true: the selection was empty or contained another family, or `--api-version` was not `auto` or `68.0`.

## Why the plugin stops

Draft handling exists only for calculated insights on the API 68 route. Mixing other families into a draft run would make it unclear which items are drafts.

## How to fix

1. Select only calculated insight files or `-m calculated-insight:<Name>__cio` selectors.
2. Use `--api-version auto` (the default) or `68.0`.
3. Deploy other families in a separate run without `--draft`.

## Example output

```text
Deploy execution: blocked (INVALID_DRAFT_SCOPE). No automatic retry or rollback performed.
Deployed: 0 (0 created / 0 updated / 0 failed)
INVALID_DRAFT_SCOPE: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Deployment did not complete. Check item outcomes, explicit inputs, target authentication and supported scope. Mutation may have occurred for unknown mutations; inspect target before any further attempt. No automatic retry or rollback was performed.
Hint: --draft applies only to calculated insights at API auto or 68.0. Select only calculated insights and drop other API versions.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_DRAFT_SCOPE.md
```

## Related codes

- [`INVALID_ASYNC_SCOPE`](../general/INVALID_ASYNC_SCOPE.md) — `--async` used without an identity resolution.
- [`INVALID_SCOPE`](../general/INVALID_SCOPE.md) — API version or data space not supported for a family.
