# `DEPENDENCY_INPUT_CHANGED`

> A selected file changed on disk while the command was running. Finish editing, then rerun the deploy.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Dependency                      |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The plugin records the content of every selected file at the start and compares it again before acting. A file was different on the second look, for example because an editor saved it or a Git checkout ran.

## Why the plugin stops

The checks and the plan were made for the file as it was. Deploying a file that changed in between would send something that was never checked.

## How to fix

1. Save your changes and stop tools that write to the project.
2. Rerun the deploy (preview first if the change was large).

## Example output

```text
Deploy preview: blocked (DEPENDENCY_INPUT_CHANGED). No deployment executed.
DEPENDENCY_INPUT_CHANGED: Preview did not complete. Check explicit authored inputs, target authentication and supported scope. No deployment executed.
Hint: A selected file changed on disk while the command was running. Finish editing, then rerun the deploy.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/dependency/DEPENDENCY_INPUT_CHANGED.md
```

## Related codes

- [`DEPLOY_FRESH_ADMISSION_BLOCKED`](../general/DEPLOY_FRESH_ADMISSION_BLOCKED.md) — a later check in the batch failed.
