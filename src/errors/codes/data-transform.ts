/** CLI hints for Data transform error codes. Long-form pages: docs/errors/data-transform/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  INCOMPLETE_TRANSFORM_INVENTORY:
    'The list of data transforms in the org could not be read completely and consistently. Nothing was changed; rerun the command when the org is not changing transforms.',
  INVALID_TRANSFORM_DELETE_SELECTION:
    'A data transform delete names it exactly as -m data-transform:<Name>; with --changed-since, the deleted file must hold the transform its file name names. Fix the selection and rerun.',
  INVALID_TRANSFORM_OFFSET:
    'The plugin asked for an invalid page of the data transform list. Nothing was changed; this points to a plugin bug, so report it with the command you ran.',
  INVALID_TRANSFORM_RESPONSE:
    'Salesforce returned something other than a data transform record when the plugin read it. Nothing was changed; check the transform in Data Cloud and rerun.',
  INVALID_TRANSFORM_SCOPE:
    'Data transforms are only supported with API version auto or 68.0. Remove another --api-version value and rerun.',
  INVALID_TRANSFORM_SELECTION:
    'A data transform name or record ID has an invalid format. Use the API name as in the org (letters, digits, underscores) or the 18-character ID starting with 1dt, then rerun.',
  INVALID_TRANSFORM_TARGET_ID:
    'A data transform record ID does not have the expected format (1dt followed by 15 letters or digits). Nothing was changed; check the transform in Data Cloud, then rerun.',
  PARTIAL_TRANSFORM_OUTPUT:
    'The transform file was written, but the final check of its contents failed. Open data360/dataTransforms/<Name>.dataTransform.json, then rerun the retrieve with --overwrite.',
  TRANSFORM_CONNECTION_DRIFT:
    'The connection to the org changed while the command was running. Check that your org login is stable, then rerun the command.',
  TRANSFORM_DATASPACE_MISMATCH:
    "The data transform (its file's c__dataSpace, or the transform of that name in the org) is in another data space than the run. A transform without any data space in the org is handled in default. Run with the --dataspace the message names, then rerun.",
  TRANSFORM_DATASPACE_UNREADABLE:
    'The plugin could not read the data space of the transform from the org (SOQL on MktDataTransform), so nothing was retrieved, changed or deleted. Check the org login and the message, then rerun.',
  TRANSFORM_DELETE_IDENTITY_MISMATCH:
    'The data transform list has no entry with the resolved ID and name together. Nothing was deleted; the transform changed during the run, so preview the delete again, then rerun.',
  TRANSFORM_DELETE_INPUT_DRIFT:
    'The delete inputs or the transform definition changed while the command was running. Nothing was deleted; wait until nobody is editing the transform, then rerun.',
  TRANSFORM_DELETE_PROCESSING:
    'The data transform is still PROCESSING, so the delete was not sent. Nothing was changed; wait until Data Cloud shows the transform ACTIVE, then rerun the delete.',
  TRANSFORM_DELETE_UNCONFIRMED:
    'The DELETE was sent but its result could not be confirmed. Do not rerun the delete; check in Data Cloud whether the transform still exists.',
  TRANSFORM_DEPLOY_FAILED:
    'The data transform deploy stopped on an error the plugin does not classify, such as an HTTP error from Salesforce. Read the message, check the transform in Data Cloud, then rerun.',
  TRANSFORM_FILENAME_COLLISION:
    'Another file in data360/dataTransforms differs only in case or trailing spaces, or holds a different transform. Rename or remove that file, then rerun the retrieve.',
  TRANSFORM_IDENTITY_MISMATCH:
    'The transform read from the org does not match the requested name or ID, for example a name that differs only in letter case. Use the name exactly as in the org, then rerun.',
  TRANSFORM_PREFIX_MISMATCH:
    "A data transform name does not match its data space's prefix (ds2_ in dataspace2; no other space's prefix in default). A new transform is refused, an existing one only warned about.",
  TRANSFORM_PREVIEW_LIMITATIONS:
    'This preview only read from the org. Salesforce validation did not run; create or update was chosen by name from the current list of transforms.',
  TRANSFORM_READBACK_MISMATCH:
    'The transform was written, but reading it back did not return a transform with the written ID and name, or a written schedule with the frequency of the file. Check the transform in Data Cloud before deploying again.',
  TRANSFORM_RETRIEVE_FAILED:
    'The data transform could not be retrieved because of an error the plugin does not classify, such as an HTTP error. Read the message, check the name and your org login, then rerun.',
  TRANSFORM_SCHEDULE_CHANGE:
    'The deploy sends the schedule of the file, so the transform runs on that schedule in the target org ({ "frequency": "None" } turns it off). Remove the schedule key from the file to leave the org schedule alone.',
  TRANSFORM_SCHEDULE_NOT_SENT:
    'The transform definition was written, but the transform was still processing at the end of the wait, so its schedule was not sent. Wait until it is ACTIVE, then rerun the deploy.',
  TRANSFORM_SCHEDULE_REJECTED:
    'The transform definition was written, but Salesforce rejected the schedule of the file. Read its message, correct the schedule in the file, then rerun the deploy.',
  TRANSFORM_SERVER_PROCESSING:
    'The transform definition was written and read back, but Data Cloud is still processing it. Check its status in Data Cloud before relying on its output.',
  TRANSFORM_TARGET_DRIFT:
    'The transform in the org differs from the local file or changed during the run. Nothing was changed; retrieve it again, review the difference, then rerun.',
  TRANSFORM_TARGET_NOT_RESOLVED:
    'Two or more data transforms in the org have this name when letter case is ignored, so it does not resolve to one transform. Nothing was changed; rename or remove the duplicate in Data Cloud, then rerun.',
  TRANSFORM_VALIDATION_FAILED:
    'Salesforce validation rejected the new data transform, or its answer could not be read. Nothing was created; check the definition and DLOs in Data Cloud, then rerun.',
  TRANSFORM_WRITE_IDENTITY_MISMATCH:
    'Salesforce answered the write with a different or invalid transform ID or name. Check in Data Cloud which transform was changed before deploying again.',
  TRANSFORM_WRITE_UNCONFIRMED:
    'The transform write was sent, but Salesforce did not return a readable confirmation. Check in Data Cloud whether the transform was created or updated before deploying again.',
  UNSUPPORTED_TRANSFORM_INPUT:
    'The data transform file is not inert JSON, or its name, definition/definitions, a top-level key, schedule or data space is not one the plugin can send. Fix the file (the message names the key) and rerun.',
};
