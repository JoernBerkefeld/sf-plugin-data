# `IDENTITY_RESOLUTION_NOT_SETTLED`

> The ruleset is still publishing or deleting in the org, so it cannot be changed now. Wait until it settles, then rerun the same command.

|              |                                                            |
| ------------ | ---------------------------------------------------------- |
| **Family**   | Identity resolution                                        |
| **Commands** | `sf data360 deploy`, `sf data360 delete`                   |
| **Outcome**  | `processing` (exit code 69) — this ruleset was not changed |

## What it means

The ruleset in the org has the status `PUBLISHING` or `DELETING`. This is normal for a few minutes after a create, update or delete, and right after `sf data360 deploy --async`.

Rerunning a deploy is also how you check an `--async` deploy: this code means it is still in progress, `unchanged` means it settled as written.

The item itself is `blocked`. The run counts it as still processing, not as failed: when nothing else failed, a deploy or delete ends as `processing` with exit code 69. When another item failed or was blocked, that wins (exit code 1, or 68 for `partial` when something was written). A preview only reports it and ends as `blocked`.

## Why the plugin stops

While Salesforce is still processing the ruleset, the plugin cannot tell its own earlier change apart from a new one, and a second write could interfere with the first.

## How to fix

1. Wait a few minutes (publishing usually takes one to four minutes).
2. Rerun the same `sf data360 deploy` or `sf data360 delete` command.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: identity-resolution:Individual_Main.
IDENTITY_RESOLUTION_NOT_SETTLED: The ruleset is still publishing or deleting in the org, so it cannot be changed now. Wait until it settles, then rerun the same command.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/identity-resolution/IDENTITY_RESOLUTION_NOT_SETTLED.md
```

## Related codes

- [`IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED`](../identity-resolution/IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED.md) — a deploy that ended before the ruleset settled.
- [`DATA_GRAPH_OWNER_NOT_PUBLISHED`](../data-graph/DATA_GRAPH_OWNER_NOT_PUBLISHED.md) — a data graph that needs this ruleset published.
