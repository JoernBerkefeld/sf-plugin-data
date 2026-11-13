/** CLI hints for Data transform error codes. Long-form pages: docs/errors/data-transform/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  INCOMPATIBLE_TRANSFORM_DLO_FIELDS:
    'The mapped source and output fields are missing, not primary keys, or defined differently. Make both fields primary keys with the same type and settings, then rerun.',
  INCOMPLETE_TRANSFORM_INVENTORY:
    'The list of data transforms in the org could not be read completely and consistently. Nothing was deleted; rerun the delete when the org is not changing transforms.',
  INVALID_TRANSFORM_DELETE_SELECTION:
    'A transform delete needs one --metadata data-transform:Name, --source-dir pointing at its .dataTransform.json file, and --transform-target-id. Fix the flags and rerun.',
  INVALID_TRANSFORM_DEPLOY_SELECTION:
    'A transform deploy needs --transform-operation create, or update with a valid --transform-target-id. Do not pass a target ID with create. Fix the flags and rerun.',
  INVALID_TRANSFORM_FLAG_SCOPE:
    '--transform-operation or --transform-target-id was given, but no data transform is selected. Select a .dataTransform.json file or remove these flags, then rerun.',
  INVALID_TRANSFORM_OFFSET:
    'The plugin asked for an invalid page of the data transform list. Nothing was changed; this points to a plugin bug, so report it with the command you ran.',
  INVALID_TRANSFORM_RESPONSE:
    'Salesforce returned something other than a data transform record when the plugin read it. Nothing was changed; check the transform in Data Cloud and rerun.',
  INVALID_TRANSFORM_SCOPE:
    'Data transforms are only supported with API version auto or 68.0 in the default data space. Remove other --api-version or data space values and rerun.',
  INVALID_TRANSFORM_SELECTION:
    'A data transform must be deployed alone: one .dataTransform.json file, no --changed-since, --draft or --wait-timeout, and no other components. Narrow the selection and rerun.',
  INVALID_TRANSFORM_TARGET_ID:
    'The data transform record ID has the wrong format. Use the 18-character ID starting with 1dt from the org, then rerun.',
  PARTIAL_TRANSFORM_OUTPUT:
    'The transform file was written, but the final check of its contents failed. Open data360/dataTransforms/<Name>.dataTransform.json, then rerun the retrieve with --overwrite.',
  TRANSFORM_CONNECTION_DRIFT:
    'The connection to the org changed while the command was running. Check that your org login is stable, then rerun the command.',
  TRANSFORM_DELETE_CONFIRMATION_REQUIRED:
    'All checks passed, but the delete was not confirmed. Add --confirm-delete to delete the data transform; nothing was changed.',
  TRANSFORM_DELETE_IDENTITY_MISMATCH:
    'The data transform list has no entry with this ID and name together. Nothing was deleted; check --transform-target-id and the file name against the org, then rerun.',
  TRANSFORM_DELETE_INPUT_DRIFT:
    'The delete inputs or the local transform file changed while the command was running. Nothing was deleted; stop other edits to the file and rerun.',
  TRANSFORM_DELETE_UNCONFIRMED:
    'The DELETE was sent but its result could not be confirmed. Do not rerun the delete; check in Data Cloud whether the transform still exists.',
  TRANSFORM_DEPLOY_FAILED:
    'The data transform deploy stopped on an error the plugin does not classify, such as an HTTP error from Salesforce. Read the message, check the transform in Data Cloud, then rerun.',
  TRANSFORM_DLO_IDENTITY_MISMATCH:
    'The source and output of the transform resolve to the same DLO in the org. Point the output at a different, existing DLO in the .dataTransform.json file and rerun.',
  TRANSFORM_FILENAME_COLLISION:
    'Another file in data360/dataTransforms differs only in case or trailing spaces, or holds a different transform. Rename or remove that file, then rerun the retrieve.',
  TRANSFORM_IDENTITY_MISMATCH:
    'The transform read from the org does not match the requested name or ID. For an update, check that --transform-target-id belongs to the transform named in the file, then rerun.',
  TRANSFORM_PREREQUISITE_CHANGED:
    'The transform was written, but the source or output DLO changed during the deploy. Check both DLOs and the transform in Data Cloud before deploying again.',
  TRANSFORM_PREREQUISITE_DRIFT:
    'The source or output DLO changed between the plugin checks and the write. Nothing was changed; wait until nobody is editing those DLOs, then rerun.',
  TRANSFORM_PREVIEW_LIMITATIONS:
    'This preview only read from the org. Salesforce validation did not run, and a planned create does not prove that the name is free.',
  TRANSFORM_PROCESSING_ACKNOWLEDGMENT_REQUIRED:
    'Creating or updating a data transform starts processing in Data Cloud. Add --allow-processing to confirm, then rerun; nothing was changed.',
  TRANSFORM_READBACK_MISMATCH:
    'The transform was written, but reading it back gave a different definition. Check the transform in Data Cloud before deploying again.',
  TRANSFORM_RETRIEVE_FAILED:
    'The data transform could not be retrieved because of an error the plugin does not classify, such as an HTTP error. Read the message, check the name and your org login, then rerun.',
  TRANSFORM_SERVER_PROCESSING:
    'The transform definition was written and verified, but Data Cloud is still processing it. Check its status in Data Cloud before relying on its output.',
  TRANSFORM_TARGET_DRIFT:
    'The transform in the org differs from the local file or changed during the run. Nothing was changed; retrieve it again, review the difference, then rerun.',
  TRANSFORM_VALIDATION_FAILED:
    'Salesforce validation rejected the new data transform, or its answer could not be read. Nothing was created; check the definition and DLOs in Data Cloud, then rerun.',
  TRANSFORM_WRITE_IDENTITY_MISMATCH:
    'Salesforce answered the write with a different or invalid transform ID or name. Check in Data Cloud which transform was changed before deploying again.',
  TRANSFORM_WRITE_UNCONFIRMED:
    'The transform write was sent, but Salesforce did not return a readable confirmation. Check in Data Cloud whether the transform was created or updated before deploying again.',
  UNSUPPORTED_TRANSFORM_DLO_STATE:
    'The source or output DLO is not active or not in the Other category. Activate it or pick DLOs that are, then rerun.',
  UNSUPPORTED_TRANSFORM_FREQUENCY:
    'The data transform full run frequency is not DAILY, which the plugin does not support. Set it to daily in Data Cloud or manage this transform there.',
  UNSUPPORTED_TRANSFORM_INPUT:
    'The data transform uses features outside the supported shape: one batch load from a DLO with one field mapped into another DLO. Manage this transform in Data Cloud.',
  UNSUPPORTED_TRANSFORM_LOGIC_CHANGE:
    'The update changes the transform logic, but only label and description can be updated. Revert the logic in the file, or create a new transform with --transform-operation create.',
  UNSUPPORTED_TRANSFORM_OWNER_OR_STATE:
    'The data transform is not a custom batch transform in the default data space with status ACTIVE. Wait until it is active, or manage this transform in Data Cloud.',
  UNSUPPORTED_TRANSFORM_SCHEDULE:
    'The data transform has a schedule, which the plugin does not support. Remove the schedule in Data Cloud, or manage this transform there.',
  UNSUPPORTED_TRANSFORM_VARIANT:
    'The data transform has extra definitions, schedules or a namespace from a package, which the plugin does not support. Manage this transform in Data Cloud.',
};
