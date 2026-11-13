# `DEPENDENCY_REQUEST_LIMIT_EXCEEDED`

> Retrieving this selection would need more than 512 reads from the org. Retrieve fewer DMOs or segments per command.

|              |                                   |
| ------------ | --------------------------------- |
| **Family**   | Dependency                        |
| **Commands** | `sf data360 retrieve`             |
| **Outcome**  | `blocked` — no files were written |

## What it means

A retrieve of DMOs and segments reads each selected component and two records for every DMO a segment refers to. For this selection that would be more than 512 reads.

## Why the plugin stops

The limit keeps a single run bounded so it does not flood the org with requests.

## How to fix

Split the selection and run several retrieves with fewer `--metadata` entries each.

## Example output

```text
Retrieve: blocked.
segment:High_Value_Customers: DEPENDENCY_REQUEST_LIMIT_EXCEEDED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: Retrieving this selection would need more than 512 reads from the org. Retrieve fewer DMOs or segments per command.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_REQUEST_LIMIT_EXCEEDED.md
```

## Related codes

- [`DEPENDENCY_LIMIT_EXCEEDED`](../dependency/DEPENDENCY_LIMIT_EXCEEDED.md) — too many components or links.
