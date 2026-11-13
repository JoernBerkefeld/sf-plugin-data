# `DEPENDENCY_CLOSURE_UNSUPPORTED`

> The definition of a retrieved DMO could not be checked for the components it depends on, so nothing was written. Check the DMO in the org, then rerun.

|              |                                   |
| ------------ | --------------------------------- |
| **Family**   | Dependency                        |
| **Commands** | `sf data360 retrieve`             |
| **Outcome**  | `blocked` — no files were written |

## What it means

Before writing a selection, the plugin works out what each component depends on. For one DMO the definition read from the org could not be checked, so its dependencies are unknown.

## Why the plugin stops

An unknown dependency is not the same as no dependency. The plugin does not treat the DMO as standalone when it cannot prove it.

## How to fix

1. Open the named DMO in Data Cloud and check that it is complete.
2. Retrieve it on its own (`sf data360 retrieve --metadata dmo:<Name>`) to see a more specific code.
3. Rerun the retrieve.

## Example output

```text
Retrieve: blocked.
dmo:Customer__dlm: DEPENDENCY_CLOSURE_UNSUPPORTED: This component was not retrieved. Resolve its capability, acquisition or output diagnostic.
Hint: The definition of a retrieved DMO could not be checked for the components it depends on, so nothing was written. Check the DMO in the org, then rerun.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_CLOSURE_UNSUPPORTED.md
```

## Related codes

- [`DEPENDENCY_IDENTITY_UNSUPPORTED`](../dependency/DEPENDENCY_IDENTITY_UNSUPPORTED.md) — a component or reference has an unsupported identity.
