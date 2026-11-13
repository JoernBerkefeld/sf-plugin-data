# `DLO_INVENTORY_UNSUPPORTED`

> Retrieving every DLO with a bare -m dlo is not supported. Name each one as -m dlo:<Name>__dll.

|              |                                         |
| ------------ | --------------------------------------- |
| **Family**   | Data lake object                        |
| **Commands** | `sf data360 retrieve`                   |
| **Outcome**  | `blocked` — nothing was read or written |

## What it means

`sf data360 retrieve -m dlo` asks for all data lake objects of the org. The plugin only retrieves DLOs you name one by one.

## Why the plugin stops

An org holds many DLOs that Salesforce creates for data streams and other features. Listing and saving all of them would fill the project with definitions you do not own. Retrieving by exact name keeps the project limited to what you chose.

## How to fix

Name each DLO, repeating `-m` as needed:

```sh
sf data360 retrieve --target-org my-org -m dlo:Orders__dll -m dlo:Returns__dll
```

## Example output

```text
Retrieve: blocked (DLO_INVENTORY_UNSUPPORTED).
DLO_INVENTORY_UNSUPPORTED: Retrieval did not complete. Check selection, authenticated org, service capability and output path.
Hint: Retrieving every DLO with a bare -m dlo is not supported. Name each one as -m dlo:<Name>__dll.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dlo/DLO_INVENTORY_UNSUPPORTED.md
```

## Related codes

- [`INVALID_SELECTION`](../general/INVALID_SELECTION.md) — a named selector that is not a valid DLO name.
