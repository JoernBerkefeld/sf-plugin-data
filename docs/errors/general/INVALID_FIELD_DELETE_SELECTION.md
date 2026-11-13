# `INVALID_FIELD_DELETE_SELECTION`

> --field needs exactly one -m dmo:<Name__dlm> and no other selector, --source-dir, --delete-dlo or --transform-target-id; --output-dir works only with --field.

|              |                                  |
| ------------ | -------------------------------- |
| **Family**   | General                          |
| **Commands** | `sf data360 delete`              |
| **Outcome**  | `blocked` — no org call was made |

## What it means

Field-level delete removes custom fields from one DMO. It was refused because the flags do not form a field-level delete: `--field` was combined with more than one selector, a non-DMO selector, `--source-dir`, `--changed-since`, `--delete-dlo` or `--transform-target-id`, or `--output-dir` was given without `--field`.

## Why the plugin stops

Field-level delete is the one delete that also changes mappings and rewrites project files. Keeping it to a single DMO and no other options makes its effect easy to predict.

## How to fix

1. Use exactly one `-m dmo:<Name__dlm>` with one or more `--field <Name__c>`.
2. Remove `--source-dir`, `--changed-since`, `--delete-dlo` and `--transform-target-id`.
3. Use `--output-dir` only together with `--field`.
4. Run with `--preview` first, then with `--confirm-delete`.

## Example output

```text
Delete: blocked.
INVALID_FIELD_DELETE_SELECTION: --field removes fields from exactly one -m dmo:<Name__dlm> and cannot be combined with another selector, --source-dir, --changed-since, --delete-dlo or --transform-target-id; --output-dir is valid only with --field. No org call was made.
Hint: --field needs exactly one -m dmo:<Name__dlm> and no other selector, --source-dir, --delete-dlo or --transform-target-id; --output-dir works only with --field.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/general/INVALID_FIELD_DELETE_SELECTION.md
```

## Related codes

- [`INVALID_DMO_FIELD`](../dmo/INVALID_DMO_FIELD.md) — a `--field` value is not a custom field name.
- [`DMO_FIELD_DELETE_CONFIRMATION_REQUIRED`](../dmo/DMO_FIELD_DELETE_CONFIRMATION_REQUIRED.md) — the field delete needs `--confirm-delete`.
