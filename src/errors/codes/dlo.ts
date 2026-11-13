/** CLI hints for Data lake object error codes. Long-form pages: docs/errors/dlo/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  AMBIGUOUS_DLO_RESPONSE:
    'Salesforce returned zero or several data lake objects where exactly one was expected. Check that the name is unique in the org, then rerun.',
  DLO_DATASPACE_COLLISION:
    'The local DLO file already belongs to another data space. Retrieve into a different --output-dir or move the existing file away, then rerun.',
  DLO_DATASPACE_MISMATCH:
    'The DLO file, --dataspace and the org disagree on the data space. Make identity.dataSpace in the file match --dataspace and the target DLO, then rerun.',
  DLO_DELETE_NOT_CONFIRMED:
    'Salesforce accepted the DLO DELETE, but the DLO could not be confirmed gone. Do not rerun the delete; read the DLO in the org first and act on what you find.',
  DLO_DELETE_UNCONFIRMED:
    'The DLO DELETE got an unexpected answer, so its outcome is unknown. Read the DLO in the org before you run the delete again.',
  DLO_DEPENDENCIES_UNCONFIRMED:
    'The dependency list of the DLO could not be read in the expected form, so the delete was not started. Check access to the DLO in the org and rerun.',
  DLO_DEPENDENCY_EXISTS:
    'Other components still depend on this DLO. Delete the listed dependents first, or select them in the same command as dmo:<Name> or mapping:<Name>.',
  DLO_DEPENDENCY_PENDING:
    'Salesforce still lists the dependents this command deleted, so the DLO itself was not deleted. Wait until its dependency list is empty, then rerun the delete.',
  DLO_HTTP_ERROR:
    'Salesforce answered a DLO request with an HTTP error. Read the status and API detail in the message, fix access, name or input, then rerun.',
  DLO_INVENTORY_UNSUPPORTED:
    'Retrieving every DLO with a bare -m dlo is not supported. Name each one as -m dlo:<Name>__dll.',
  DLO_REQUEST_UNCONFIRMED:
    'A DLO request ended without a readable answer from Salesforce. Check the org connection, inspect the target if a write was sent, then rerun.',
  DLO_TARGET_IDENTITY_MISMATCH:
    'The org returned a DLO whose name or ID does not match the one requested. Check the exact API name in the org and rerun; inspect the target first if a write was sent.',
  INVALID_DLO_DOCUMENT:
    'The DLO definition from the org does not fit the plugin file format. Inspect the DLO in the org (label, data space, event field) and report it if it looks normal.',
  INVALID_DLO_FIELD:
    'A field of the DLO read from the org does not fit the plugin file format. Inspect the field names and types of the DLO in the org.',
  INVALID_DLO_NAME:
    'The DLO API name is not valid. Use the exact name: a letter first, then letters, digits or underscores, ending in __dll.',
  INVALID_DLO_PRIMARY_KEY:
    'The DLO does not have exactly one usable primary-key field. Mark one ordinary field (not KQ_ or a system field) with isPrimaryKey true, then rerun.',
  INVALID_DLO_RESPONSE:
    'Salesforce returned a DLO answer the plugin could not read. Inspect the DLO in the org, especially if a write was sent, then rerun.',
  INVALID_DLO_TARGET_ID:
    'The org returned a DLO record ID in an unexpected form, so the write or delete was not sent. Inspect the DLO in the org and rerun.',
  PARTIAL_DLO_OUTPUT:
    'The DLO file was written but could not be verified afterwards. Check the file under data360/dlo, then rerun the retrieve with --overwrite.',
  UNSUPPORTED_DLO_CATEGORY_CHANGE:
    'The category of an existing DLO cannot be changed. Set category in the file back to the org value, or create the DLO under a new name.',
  UNSUPPORTED_DLO_DATASPACE:
    'The DLO in the org is not in exactly one data space, or not in the one requested. Pass the --dataspace that holds the DLO and rerun.',
  UNSUPPORTED_DLO_EVENT_FIELD_CHANGE:
    'The event date field of an existing DLO cannot be changed. Set eventDateTimeFieldName back to the org value, or leave it out of the file.',
  UNSUPPORTED_DLO_FIELD_ADDITION:
    'A field added to an existing DLO cannot be a primary key or a generated field. Remove it from the file or add it as an ordinary field.',
  UNSUPPORTED_DLO_FIELD_CHANGE:
    'An existing DLO field was changed or removed in the file, which Salesforce does not allow. Restore the field as it is in the org; only new fields can be added.',
  UNSUPPORTED_DLO_SELECTION:
    'The target org or DLO name passed to a DLO request is not valid. Use a real --target-org alias or username and exact DLO names ending in __dll.',
};
