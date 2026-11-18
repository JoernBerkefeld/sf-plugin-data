# `UNKNOWN_SEGMENT_CONFIGURATION`

> The segment has a setting the plugin does not know, or misses one. Retrieve keeps unknown settings in the file; deploy refuses them and names the key. Remove the key, or manage the segment in Data Cloud.

|              |                                                                                      |
| ------------ | ------------------------------------------------------------------------------------ |
| **Family**   | Segment                                                                              |
| **Commands** | `sf data360 deploy`, `sf data360 retrieve`                                           |
| **Outcome**  | deploy: `blocked` for the file; retrieve: the segment is written (normally or as-is) |

## What it means

On deploy, the `.segment.json` file has a key the plugin does not send, or misses one it needs. The message names the key path, for example `spec.futureSetting` or `spec.models[0].futureModelKey`.

Retrieve keeps a setting the plugin does not know: an unknown key of the segment goes into `spec` after the known keys, extra keys of `includeDbt` into `spec.includeDbt`, extra model keys stay on the model. Observed fields (audit, status, membership tables) are not checked on retrieve. This holds for every segment type. A DBT segment without its DBT configuration is written as-is (`UNSUPPORTED_SEGMENT_VARIANT`).

The criteria of a Dynamic or Einstein segment stay in `spec.includeCriteria` as read. So do the criteria of a Waterfall whose child segments retrieve could not name (the segment list read failed or does not list a child); a Waterfall whose children it names holds them in `spec.childSegments` instead, which deploy sends.

A file key the segment file never holds is refused the same way, for example `spec.parameters` (Salesforce has no write for parameters) or `spec.publishInterval` (the `schedule` key holds the refresh schedule), and so is an unknown key inside `spec.schedule`.

## Why the plugin stops

Deploy sends only the settings the plugin knows. Sending the file without an unknown setting could change the segment, so the plugin refuses it.

## How to fix

1. Read the key path in the message.
2. Remove that key from the file if the setting may be dropped, or manage the segment in Data Cloud.
3. Deploy again.

## Example output

```text
Deploy execution: blocked (INVALID_SOURCE). No automatic retry or rollback performed.
INVALID_SOURCE: The segment file cannot be deployed: spec.futureSetting is not a key a segment file can hold. Correct the file, or retrieve the segment again once the plugin supports it.
```

## Related codes

- [`UNSUPPORTED_SEGMENT_VARIANT`](../segment/UNSUPPORTED_SEGMENT_VARIANT.md) — A known setting with an unsupported value.
- [`INVALID_SEGMENT_DOCUMENT`](../segment/INVALID_SEGMENT_DOCUMENT.md) — A known setting with an invalid value.
