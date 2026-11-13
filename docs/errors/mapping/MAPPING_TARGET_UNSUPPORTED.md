# `MAPPING_TARGET_UNSUPPORTED`

> The target DMO is platform-generated, untyped or a namespaced custom DMO, which this plugin does not write mappings to. Map onto a custom or standard DMO instead.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Mapping                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

Mappings are deployed only onto custom DMOs without a namespace and onto standard DMOs. The target DMO of this mapping is of another kind, for example one the platform generated, one with a namespace prefix, or one without a creation type.

## Why the plugin stops

The plugin cannot tell which pairs of such DMOs are generated or protected, so it does not write mappings to them. A retrieve still saves these mappings with all their pairs.

## How to fix

1. Check `targetEntityDeveloperName` in the mapping file.
2. Map onto a custom DMO or a standard DMO, or change this mapping in Data Cloud Setup.

## Example output

```text
Deploy preview: blocked (MAPPING_TARGET_UNSUPPORTED). No deployment executed.
MAPPING_TARGET_UNSUPPORTED: Plugin verification or request completion failed; no Salesforce rejection was confirmed. Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: The target DMO is platform-generated, untyped or a namespaced custom DMO, which this plugin does not write mappings to. Map onto a custom or standard DMO instead.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/mapping/MAPPING_TARGET_UNSUPPORTED.md
```

## Related codes

- [`MAPPING_ACTIVATES_STANDARD_DMO`](../mapping/MAPPING_ACTIVATES_STANDARD_DMO.md) — notice when a first mapping enables a standard DMO.
