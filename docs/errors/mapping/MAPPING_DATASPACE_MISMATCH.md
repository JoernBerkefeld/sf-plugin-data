# `MAPPING_DATASPACE_MISMATCH`

> The mapping file's identity.dataSpace does not match the data space of this command. Make them match, or pass the right --dataspace.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Each mapping file records the data space it belongs to in `identity.dataSpace`. This command runs in the data space given by `--dataspace`, or `default` when the flag is not set, and the two differ.

## Why the plugin stops

Deploying a mapping into a data space it was not written for could bind objects of the wrong data space. The plugin requires them to agree.

## How to fix

1. Check `identity.dataSpace` in the mapping file.
2. Either change it to the data space you deploy to, or pass that data space with `--dataspace`.
3. Rerun with `--preview`.

## Example output

```text
Deploy preview: blocked (MAPPING_DATASPACE_MISMATCH). No deployment executed.
MAPPING_DATASPACE_MISMATCH: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The mapping file's identity.dataSpace does not match the data space of this command. Make them match, or pass the right --dataspace.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_DATASPACE_MISMATCH.md
```

## Related codes

- [`UNSUPPORTED_MAPPING_DATASPACE`](../mapping/UNSUPPORTED_MAPPING_DATASPACE.md) — Salesforce reported the mapping in another data space.
- [`MAPPING_DATASPACE_COLLISION`](../mapping/MAPPING_DATASPACE_COLLISION.md) — a local mapping file belongs to another data space.
