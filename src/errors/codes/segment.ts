/** CLI hints for Segment error codes. Long-form pages: docs/errors/segment/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  INCOMPLETE_SEGMENT:
    'The segment read finished without a usable definition and without a more specific reason. Rerun the retrieve; if it repeats, read the segment directly with the API.',
  INVALID_SEGMENT_DOCUMENT:
    'A segment value is not text the plugin can send (missing, empty, too long, control characters), the models are not a list, or a model name cannot name a SQL file. Retrieve writes such a segment as-is; fix the file for deploy.',
  INVALID_SEGMENT_RESPONSE:
    'Salesforce answered the segment read in a shape the plugin does not expect (not exactly one segment). Rerun the retrieve; if it repeats, inspect the raw API response.',
  PARTIAL_SEGMENT_OUTPUT:
    'A segment file was written, but a later step of saving the JSON and SQL files failed, so the files on disk may not be complete. Inspect the .segment.json and .sql files and retrieve again with --overwrite.',
  SEGMENT_ACQUISITION_FAILED:
    'The plugin could not read the segment from the org. Check the segment name, the target org login and the Salesforce API detail in the message, then rerun the retrieve.',
  SEGMENT_ADMISSION_FAILED:
    'The checks right before the segment write failed, so nothing was sent. Make sure the .segment.json file did not change during the run, check the org, and run the deploy again.',
  SEGMENT_CREATE_CONFLICT:
    'Salesforce refused the create because a segment with this name already exists (HTTP 409). The plugin does not switch to an update; inspect the target, then preview again.',
  SEGMENT_CREATE_UNCONFIRMED:
    'The segment create was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.',
  SEGMENT_DELETE_ADMISSION_FAILED:
    'The checks before the segment delete failed, so nothing was deleted. Read the message, check the segment and its source DMO in Data Cloud, then preview the delete again.',
  SEGMENT_DELETION_UNCONFIRMED:
    'The segment delete was sent, but the plugin could not confirm that the segment is gone. Check the segment in the org before any further delete; nothing is retried.',
  SEGMENT_DEPENDENCY_ACQUISITION_FAILED:
    'The plugin could not read the DMO this segment is built on. Check that the DMO exists in the org, that the login works and the API detail in the message, then rerun.',
  SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING:
    'The DMO this segment is built on (spec.segmentOn) was not returned under that exact name. Create the DMO in the target org or fix the name in the file, then rerun.',
  SEGMENT_DEPENDENCY_DRIFT:
    'The DMO this segment uses changed in the org while the deploy was running, so nothing was written. Make sure nobody changes the DMO, then preview and deploy again.',
  SEGMENT_FRESH_ADMISSION_BLOCKED:
    'Right before writing this segment in a batch, a fresh check no longer allowed a create, update or no change, or --allow-processing was missing. Preview the batch again.',
  SEGMENT_IDENTITY_MISMATCH:
    'Salesforce returned a segment with a different name or data space than requested. Check the exact segment name (case matters) and that it lives in the default data space.',
  SEGMENT_INVENTORY_UNQUALIFIED:
    'Retrieving every segment at once is not supported. Select each segment by name with -m segment:Name.',
  SEGMENT_READBACK_MISMATCH:
    'After the write, the segment read back differently from the file, or other settings or its DMO changed. Inspect the segment in the org before any further deploy.',
  SEGMENT_SETTLEMENT_UNQUALIFIED:
    'After the write, the segment showed a status other than active, processing or counting. Inspect the segment status in the org before any further deploy.',
  SEGMENT_TARGET_DRIFT:
    "The target segment changed between the deploy's checks and the write, so nothing was written. Preview the deploy again to see the current state.",
  SEGMENT_TARGET_IDENTITY_MISMATCH:
    'The segment found in the org has a different identity than the file. Check that identity.apiName in the .segment.json file matches the segment name in the org.',
  SEGMENT_TARGET_UNQUALIFIED:
    'The fresh check of the target segment did not allow a create or an update. Read the segment code printed with it, fix that cause, and preview the deploy again.',
  SEGMENT_UPDATE_UNCONFIRMED:
    'The segment update was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.',
  UNKNOWN_SEGMENT_CONFIGURATION:
    'The segment has a setting the plugin does not know, or misses one. Retrieve keeps unknown settings in the file; deploy refuses them and names the key. Remove the key, or manage the segment in Data Cloud.',
  UNSUPPORTED_SEGMENT_VARIANT:
    'Only DBT segments with a 90-day lookback and UI segments, on a DMO without refresh schedule, parameters or unknown UI settings, fit the segment file. Retrieve writes other segments as-is, and deploy refuses that file.',
  UNSUPPORTED_SEGMENT_XML:
    "Segment XML files cannot be deployed. Select the segment's .segment.json file instead; retrieve one with sf data360 retrieve -m segment:Name if you do not have it.",
};
