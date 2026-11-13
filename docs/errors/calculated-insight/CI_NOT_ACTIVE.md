# `CI_NOT_ACTIVE`

> The calculated insight is not ACTIVE; it is a draft or still processing. Publish it or wait for processing to finish, then rerun the retrieve.

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Family**   | Calculated insight                                            |
| **Commands** | `sf data360 retrieve`                                         |
| **Outcome**  | `blocked` — no files were written for this calculated insight |

## What it means

Retrieve exports only ACTIVE calculated insights. This code means the calculated insight exists but is a DRAFT or is still PROCESSING.

## Why the plugin stops

A draft or a calculated insight that is still processing has no settled dimensions and measures yet, so the pair could not be checked against the org.

## How to fix

1. For a draft, publish it with `sf data360 publish` or in Data 360.
2. For a processing one, wait until it is ACTIVE.
3. Rerun the retrieve.

## Example output

```text
Retrieve: blocked.
calculated-insight:ExampleInsight__cio: CI_NOT_ACTIVE: The calculated insight is not ACTIVE (draft, processing or deleting); only ACTIVE calculated insights are retrieved.
Hint: The calculated insight is not ACTIVE; it is a draft or still processing. Publish it or wait for processing to finish, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/calculated-insight/CI_NOT_ACTIVE.md
Downloaded calculated-insight: 0
```

## Related codes

- [`CI_NOT_SETTLED`](../calculated-insight/CI_NOT_SETTLED.md) — the status is one the plugin does not handle at all.
- [`CI_NOT_FOUND`](../calculated-insight/CI_NOT_FOUND.md) — the calculated insight does not exist.
