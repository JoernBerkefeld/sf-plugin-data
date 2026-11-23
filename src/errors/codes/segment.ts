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
    'The plugin could not read the segment, or a complete segment list, from the org. Check the segment name, the target org login and the Salesforce API detail in the message, then rerun.',
  SEGMENT_ADMISSION_FAILED:
    'The checks right before the segment write failed, so nothing was sent. Make sure the .segment.json file did not change during the run, check the org, and run the deploy again.',
  SEGMENT_CHILD_NOT_FOUND:
    'A child segment named in spec.childSegments of a Waterfall file is not in the target org, so nothing was written. Deploy the child first (or select it in the same deploy) or fix the name.',
  SEGMENT_CREATE_CONFLICT:
    'Salesforce refused the create because a segment with this name already exists (HTTP 409). The plugin does not switch to an update; inspect the target, then preview again.',
  SEGMENT_CREATE_UNCONFIRMED:
    'The segment create was sent, but its result could not be confirmed. Inspect the segment in the org before deploying again; the plugin does not retry.',
  SEGMENT_DATASPACE_MISMATCH:
    "The segment (its file's c__dataSpace, or the segment Salesforce read by that name) is in another data space than the run. Run with the --dataspace the message names, or correct c__dataSpace, then rerun.",
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
  SEGMENT_DEPENDENCY_OTHER_DATASPACE:
    "The DMO this segment is built on, or a Waterfall child segment, is in another data space than the segment. Name the component of the segment's own data space (<prefix>_<Name> in a non-default one), then rerun.",
  SEGMENT_FRESH_ADMISSION_BLOCKED:
    'Right before writing this segment in a batch, a fresh check no longer allowed a create, update or no change, or --allow-processing was missing. Preview the batch again.',
  SEGMENT_IDENTITY_MISMATCH:
    'Salesforce returned a segment with a different name than requested, or without a data space. Check the exact segment name (case matters), then rerun.',
  SEGMENT_MEMBERS_CHANGED:
    "The segment's member count changed during the export, so a publish finished mid-read and no file was written. Run the export again.",
  SEGMENT_MEMBERS_NOT_FOUND:
    "No segment in the run's data space has this API name, record ID or display name. Check the exact value (case matters; <prefix>_<Name> outside default) and --dataspace, then rerun the export.",
  SEGMENT_MEMBERS_OUTPUT_FAILED:
    'The members were read but the output file could not be written, so no file was left. Check that the folder is writable and has free space, then rerun.',
  SEGMENT_MEMBERS_READ_FAILED:
    'Salesforce answered a member read with an error, or the detail query did not finish, so no file was written. Read the API detail in the message, fix the cause and rerun.',
  SEGMENT_MEMBERS_UNEXPECTED_RESPONSE:
    'Salesforce answered a member read in a shape the plugin does not expect, so no file was written. Rerun the export; if it repeats, inspect the raw API response.',
  SEGMENT_MEMBER_DETAILS_AMBIGUOUS:
    'A segment member matched more than one row of the DMO the segment is built on, so --include-details cannot write one row per member. Export without --include-details.',
  SEGMENT_MEMBER_DETAILS_UNAVAILABLE:
    'The segment names no membership DMO or source DMO, or Salesforce lists no single relationship between them, so --include-details cannot join them. Export without it.',
  SEGMENT_NAME_NOT_STORED:
    "In a non-default data space Salesforce stores a segment as <prefix>_<Name>; this file's name lacks the prefix, so a create could not be read back. Nothing was sent; add the prefix to the file name and identity.apiName.",
  SEGMENT_NOT_FOUND:
    'No segment of the org has this API name or record ID in any data space, or the value is not a segment record ID (1sg…). Check the exact value (case matters; <prefix>_<Name> outside default) and deploy the segment first.',
  SEGMENT_OTHER_DATASPACE:
    'The segment with this API name or record ID exists, but in another data space than the one asked for. Use the segment of the right data space, or look it up in the data space the message names.',
  SEGMENT_PUBLISH_ADMISSION_FAILED:
    'The segment could not be read before the publish, or it does not exist in the org, so nothing was published. Deploy or check the segment, then rerun.',
  SEGMENT_PUBLISH_DEFINITION_MISMATCH:
    'The segment in the org does not hold the definition of the selected file, so it was not published. Deploy the file first, or publish the org segment with -m segment:Name.',
  SEGMENT_PUBLISH_FAILED:
    'Salesforce ran the publish and reports publishStatus FAILED. Check the segment and its source DMO in Data Cloud before publishing again; nothing was resent.',
  SEGMENT_PUBLISH_REJECTED:
    'Salesforce refused the publish request; its answer is in the message. Fix the cause it names, then run the publish again; nothing was resent.',
  SEGMENT_PUBLISH_STARTED:
    'With --async the publish was started and Salesforce accepted it; the command did not wait for the result. Read the segment later for its publish status; nothing was resent.',
  SEGMENT_PUBLISH_STILL_PROCESSING:
    'Salesforce accepted the publish and is still processing it when --wait-timeout ran out. It did not fail and was not resent; read the segment later for the result.',
  SEGMENT_PUBLISH_UNCONFIRMED:
    'The publish was sent, but its answer or the status after it could not be read, so the publish may be running. Read the segment before publishing again; nothing was resent.',
  SEGMENT_READBACK_MISMATCH:
    'After the write, the segment read back differently from the file, or other settings or its DMO changed. Inspect the segment in the org before any further deploy.',
  SEGMENT_SCHEDULE_CHANGE:
    'The deploy sends the schedule of the file, so the segment publishes on that schedule in the target org ({ "frequency": "None" } turns it off). Remove the schedule key from the file to leave the org schedule alone.',
  SEGMENT_SELECTION_AMBIGUOUS:
    "More than one segment in the run's data space matches this display name or record ID and none was chosen. Rerun with an API name listed in the message.",
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
    'The segment has parameters (no write takes them), schedule details the plugin does not know, UI criteria that are not a JSON object or no DMO source. Retrieve writes it as-is; deploy refuses it.',
  UNSUPPORTED_SEGMENT_XML:
    "Segment XML files cannot be deployed. Select the segment's .segment.json file instead; retrieve one with sf data360 retrieve -m segment:Name if you do not have it.",
};
