# `DEPENDENCY_ACQUISITION_FAILED`

> A selected DMO or segment, or an object a segment uses, could not be read from the org. Check the names and your access, then rerun the retrieve.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | Dependency                       |
| **Commands** | `sf data360 retrieve`            |
| **Outcome**  | `failed` — no files were written |

## What it means

When you retrieve DMOs and segments, the plugin reads every selected component and checks the DMOs each segment refers to before it writes any file. One of these reads failed for a reason without a more specific code, for example a network or service error.

When Salesforce sent an error, its detail is part of the message. The component that failed is named before the code.

## Why the plugin stops

The plugin writes the selection as a whole. If one part cannot be read, it writes nothing rather than a selection with gaps.

## How to fix

1. Read the message for a Salesforce detail.
2. Check that the named component exists and that your user can read it.
3. Rerun the retrieve.

## Example output

```text
Retrieve: failed.
segment:High_Value_Customers: DEPENDENCY_ACQUISITION_FAILED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: A selected DMO or segment, or an object a segment uses, could not be read from the org. Check the names and your access, then rerun the retrieve.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_ACQUISITION_FAILED.md
```

## Related codes

- [`DEPENDENCY_REQUEST_LIMIT_EXCEEDED`](../dependency/DEPENDENCY_REQUEST_LIMIT_EXCEEDED.md) — the selection needs too many reads.
- [`SEGMENT_DEPENDENCY_ACQUISITION_FAILED`](../segment/SEGMENT_DEPENDENCY_ACQUISITION_FAILED.md) — a DMO a segment uses could not be read.
