/** CLI hints for Segment error codes. Long-form pages: docs/errors/segment/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  INCOMPLETE_SEGMENT:
    'The segment read finished without a usable definition and without a more specific reason. Rerun the retrieve; if it repeats, read the segment directly with the API.',
  INVALID_SEGMENT_DEPENDENCIES:
    'The segment is built on a different DMO than the one its SQL reads, or its dependency entry does not match the SQL. Only segments whose DMO and SQL agree can be saved.',
  INVALID_SEGMENT_DOCUMENT:
    'A segment value is not plain text the plugin can save: empty, too long, with control characters, or a model name with unsupported characters. Correct it in the org, then retrieve again.',
  INVALID_SEGMENT_RESPONSE:
    'Salesforce answered the segment read in a shape the plugin does not expect (not exactly one segment). Rerun the retrieve; if it repeats, inspect the raw API response.',
  INVALID_SEGMENT_XML:
    "The segment's stored criteria text could not be decoded as the XML the plugin expects. Check the segment's criteria in the org; it cannot be saved as it is.",
  PARTIAL_SEGMENT_OUTPUT:
    'The segment file was written, but a later step of saving it failed, so the file on disk may not be complete. Inspect the .segment.json file and retrieve again with --overwrite.',
  SEGMENT_ACQUISITION_FAILED:
    'The plugin could not read the segment from the org. Check the segment name, the target org login and the Salesforce API detail in the message, then rerun the retrieve.',
  SEGMENT_ADMISSION_FAILED:
    'The checks right before the segment write failed, so nothing was sent. Make sure the .segment.json file did not change during the run, check the org, and run the deploy again.',
  SEGMENT_CREATE_AND_TARGET_UNQUALIFIED:
    'The plugin could neither prove that the segment is absent nor read it completely, so it cannot choose between create and update. Use API 68, check the read error, and preview again.',
  SEGMENT_CREATE_CONFLICT:
    'Salesforce refused the create because a segment with this name already exists (HTTP 409). The plugin does not switch to an update; inspect the target, then preview again.',
  SEGMENT_CREATE_UNCONFIRMED:
    'The segment create was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.',
  SEGMENT_DEFINITION_UPDATE_UNQUALIFIED:
    'The file changes the existing segment beyond what can be updated: only the label, the description, or appending the IS NOT NULL condition on the selected field. Revert the rest.',
  SEGMENT_DELETE_ADMISSION_FAILED:
    'The checks before the segment delete failed, so nothing was deleted. Read the message, check the segment and its source DMO in Data Cloud, then preview the delete again.',
  SEGMENT_DELETION_UNCONFIRMED:
    'The segment delete was sent, but the plugin could not confirm that the segment is gone. Check the segment in the org before any further delete; nothing is retried.',
  SEGMENT_DEPENDENCY_ACQUISITION_FAILED:
    'The plugin could not read the DMO this segment is built on. Check that the DMO exists in the org, that the login works and the API detail in the message, then rerun.',
  SEGMENT_DEPENDENCY_AMBIGUOUS_OR_MISSING:
    'The DMO this segment uses, or the field its SQL selects, was not found exactly once in the org. Create or fix the DMO and field in the target org, then rerun.',
  SEGMENT_DEPENDENCY_DRIFT:
    'The DMO this segment uses changed in the org while the deploy was running, so nothing was written. Make sure nobody changes the DMO, then preview and deploy again.',
  SEGMENT_DEPENDENCY_UNQUALIFIED:
    'The DMO this segment uses does not fit what the plugin supports: a segmentable Profile DMO in the default data space whose selected field is its only Text primary key.',
  SEGMENT_FRESH_ADMISSION_BLOCKED:
    'Right before writing this segment in a batch, a fresh check no longer allowed a create, update or no change, or --allow-processing was missing. Preview the batch again.',
  SEGMENT_IDENTITY_MISMATCH:
    'Salesforce returned a segment with a different name or data space than requested. Check the exact segment name (case matters) and that it lives in the default data space.',
  SEGMENT_INVENTORY_UNQUALIFIED:
    'Retrieving every segment at once is not supported. Select each segment by name with -m segment:Name.',
  SEGMENT_PAIR_MISMATCH:
    "The segment's stored criteria and its SQL model disagree in the org, so the plugin cannot tell which one is right. Check the segment in the org, then retrieve again.",
  SEGMENT_READBACK_MISMATCH:
    'After the write, the segment read back differently from the file, or other settings or its DMO changed. Inspect the segment in the org before any further deploy.',
  SEGMENT_SETTLEMENT_UNQUALIFIED:
    'After the write, the segment showed a status other than active, processing or counting. Inspect the segment status in the org before any further deploy.',
  SEGMENT_TARGET_DRIFT:
    "The target segment changed between the deploy's checks and the write, so nothing was written. Preview the deploy again to see the current state.",
  SEGMENT_TARGET_IDENTITY_MISMATCH:
    'The segment found in the org has a different identity than the file. Check that identity.apiName in the .segment.json file matches the segment name in the org.',
  SEGMENT_TARGET_NOT_SETTLED:
    'The existing segment is not active yet, for example still processing or counting. Wait until it shows as active in the org, then run the deploy again.',
  SEGMENT_TARGET_UNQUALIFIED:
    'The fresh check of the target segment did not allow a create or an update. Read the segment code printed with it, fix that cause, and preview the deploy again.',
  SEGMENT_UPDATE_UNCONFIRMED:
    'The segment update was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.',
  SQL_DEPENDENCIES_UNQUALIFIED:
    'The segment SQL is not in the one shape the plugin supports, so its DMO dependency cannot be read. Use a single-DMO query with WHERE 1=0, or manage this segment in Data Cloud.',
  UNKNOWN_SEGMENT_CONFIGURATION:
    'The segment has fields or settings the plugin does not know, so saving it could lose them. Only segments with the supported set of settings can be retrieved.',
  UNSUPPORTED_SEGMENT_VARIANT:
    'This kind of segment is not supported. Only SQL (DBT) segments with one model, no parameters, no refresh schedule and a 90-day lookback on one DMO can be saved.',
  UNSUPPORTED_SEGMENT_XML:
    "Segment XML files cannot be deployed. Select the segment's .segment.json file instead; retrieve one with sf data360 retrieve -m segment:Name if you do not have it.",
};
