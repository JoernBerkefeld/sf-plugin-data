# `DELETE_PHASE_NOT_SETTLED`

> Salesforce is still processing a deletion of this run, so the later phases were not started. Wait until it reads absent, then rerun the same delete.

|              |                                                                                         |
| ------------ | --------------------------------------------------------------------------------------- |
| **Family**   | General                                                                                 |
| **Commands** | `sf data360 delete`                                                                     |
| **Outcome**  | `blocked` — the items already deleted stay deleted; the later phases were not attempted |

## What it means

A delete that carries several families runs them phase by phase, in reverse dependency order: graphs, then identity resolution, calculated insights and Segments, then data transforms, then relationships, mappings, DMOs and DLOs, then data streams. A phase starts only after every item of the previous phase settled.

Salesforce accepted the deletion of the item named in the message, but still reads it in a deleting state (`deletion-processing`, mutation `acknowledged-processing`). That item is not gone yet, so the phases after it were not started: deleting a component while something that uses it is still being removed could be refused or leave the org half changed.

## Why the plugin stops

The plugin does not wait for a deletion that Salesforce processes in the background, and it never starts a later phase on an unsettled one. Stopping leaves a state that a rerun of the same command picks up safely.

## How to fix

1. Wait until the item reads absent (an identity resolution usually takes a few minutes), for example with `sf data360 retrieve -m <type>:<ApiName>`.
2. Rerun the same delete. Items that are already gone report `unchanged`; the remaining phases run.

## Example output

```text
Delete: blocked.
deleted data-graph Customer_Graph
deleted identity-resolution Individual_A1b2 (server is still processing)
DELETE_PHASE_NOT_SETTLED: Salesforce accepted the deletion of identity-resolution:Individual_A1b2 and is still processing it, so the later phases of this delete were not started. Rerun the same delete once it reads absent; items already deleted report unchanged.
Hint: Salesforce is still processing a deletion of this run, so the later phases were not started. Wait until it reads absent, then rerun the same delete.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/DELETE_PHASE_NOT_SETTLED.md
```

## Related codes

- [`DELETE_FAILED`](../general/DELETE_FAILED.md) — a delete step failed without a more specific code.
- [`DESTRUCTIVE_CONFIRMATION_REQUIRED`](../general/DESTRUCTIVE_CONFIRMATION_REQUIRED.md) — a `--changed-since` delete needs `--confirm-delete`.
