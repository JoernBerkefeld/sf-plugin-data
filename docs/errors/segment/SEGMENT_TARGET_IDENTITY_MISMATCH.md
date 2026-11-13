# `SEGMENT_TARGET_IDENTITY_MISMATCH`

> The segment found in the org has a different identity than the file. Check that identity.apiName in the .segment.json file matches the segment name in the org.

|              |                                 |
| ------------ | ------------------------------- |
| **Family**   | Segment                         |
| **Commands** | `sf data360 deploy`             |
| **Outcome**  | `blocked` — nothing was changed |

## What it means

The preview read the segment named in the file, but the definition it got back has a different API name or data space than the file.

## Why the plugin stops

An update must apply to exactly the segment the file names. The plugin does not update a segment whose identity differs.

## How to fix

1. Check `identity.apiName` and `identity.dataSpace` in the file; the data space must be `default`.
2. Check the segment API name in the org, including upper and lower case.
3. Preview the deploy again.

## Example output

```text
Deploy preview: blocked (DEPLOY_PREVIEW_BLOCKED). No deployment executed.
Planned blocked: segment:Example_Segment.
SEGMENT_TARGET_IDENTITY_MISMATCH: Segment preview is not execution authorization. Resolve the unsupported configuration or target qualification before deployment.
Hint: The segment found in the org has a different identity than the file. Check that identity.apiName in the .segment.json file matches the segment name in the org.
Docs: https://github.com/JoernBerkefeld/sf-plugin-data/blob/v0.1.0/docs/errors/segment/SEGMENT_TARGET_IDENTITY_MISMATCH.md
```

## Related codes

- [`SEGMENT_IDENTITY_MISMATCH`](../segment/SEGMENT_IDENTITY_MISMATCH.md) — The same check during a retrieve.
