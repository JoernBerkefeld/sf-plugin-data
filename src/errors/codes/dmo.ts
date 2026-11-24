/** CLI hints for Data model object error codes. Long-form pages: docs/errors/dmo/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  DMO_DATASPACE_MISMATCH:
    "The DMO file's c__dataSpace is not the data space of the run, or the DMO in the org is in another one. Run with the --dataspace the file names, or correct c__dataSpace, then rerun.",
  DMO_DELETE_NOT_CONFIRMED:
    'Salesforce accepted the DMO DELETE, but the DMO could not be confirmed gone. Do not rerun the delete; read the DMO in the org first and act on what you find.',
  DMO_DELETE_UNCONFIRMED:
    'The DMO DELETE got an unexpected answer, so its outcome is unknown. Read the DMO in the org before you run the delete again.',
  DMO_FIELD_KEY_NOT_SENT:
    'Salesforce takes no input for the named DMO field keys, so the file values were not sent and the org keeps its own. Change them in the Data Model UI if needed.',
  DMO_FIELD_NOT_FOUND:
    'A field named for removal does not exist on the DMO in the org. Check the exact field API names, then rerun.',
  DMO_FIELD_REMOVAL_FAILED:
    'The Metadata API did not confirm the field removal. Read the DMO and its mappings in the org to see which fields remain before another attempt.',
  DMO_FIELD_REMOVAL_MAPPED:
    'A field to remove is still mapped. Drop its pair from the mapping first, or select every mapping holding it in the same deploy with that pair removed from each file.',
  DMO_FIELD_REMOVAL_PLANNED:
    'Fields missing from the DMO file will be removed from the org. If that is not what you want, add them back to the file before you deploy.',
  DMO_FIELD_REMOVAL_SIDE_EFFECT:
    'Salesforce changed more than the removed fields and their mapping pairs. Nothing was rolled back; read the DMO and its mappings before any further action.',
  DMO_FIELD_REMOVAL_UNAVAILABLE:
    'The plugin had no Metadata API route for the planned field removal, so nothing was written. Rerun the command; if it persists, report it with the --json output.',
  DMO_HTTP_ERROR:
    'Salesforce answered a DMO request with an HTTP error. Read the status and API detail in the message, fix access, name or input, then rerun.',
  DMO_PERSISTENCE_UNCONFIRMED:
    'The DMO change was sent, but reading it back did not show it. Read the DMO in the org before another attempt; the change may still have taken effect.',
  DMO_PREFIX_MISMATCH:
    "A custom DMO name does not match its data space's prefix (ds2_ in dataspace2; no other space's prefix in default). A new DMO is refused, an existing one only warned about.",
  DMO_REQUEST_UNCONFIRMED:
    'A DMO request ended without a readable answer from Salesforce. Check the org connection, inspect the target if a write was sent, then rerun.',
  DMO_TARGET_IDENTITY_MISMATCH:
    'The org returned a DMO whose name does not match the one requested. Check the exact API name in the org and rerun; inspect the target first if a write was sent.',
  INVALID_DMO_DOCUMENT:
    'The DMO definition from the org does not fit the plugin file format. Inspect the DMO in the org (name, data space, label, category, fields) and report it if it looks normal.',
  INVALID_DMO_FIELD:
    'A DMO field name or definition is not valid. Use exact custom field names ending in __c; for a field read from the org, inspect that field.',
  INVALID_DMO_NAME:
    'The DMO API name is not valid. Use the exact name: a letter first, then letters, digits or underscores, ending in __dlm.',
  INVALID_DMO_RESPONSE:
    'Salesforce returned a DMO answer the plugin could not read. Inspect the DMO in the org, especially if a write was sent, then rerun.',
  PARTIAL_DMO_OUTPUT:
    'The DMO file was written but could not be verified afterwards. Check the file under data360/dmo, then rerun the retrieve.',
  UNSUPPORTED_DMO_DATASPACE:
    'The DMO in the org is not in the data space of the run. Pass the --dataspace that holds the DMO (its c__dataSpace), or leave the flag out for default, and rerun.',
  UNSUPPORTED_DMO_FIELD_ADDITION:
    'This field cannot be added to the existing DMO. New fields must not be primary keys or generated, and on a standard DMO need a name without a namespace.',
  UNSUPPORTED_DMO_FIELD_CHANGE:
    'The file changes or removes a DMO field in a way the plugin cannot apply. Restore it as in the org; to remove a custom field, deploy with --allow-field-removal.',
  UNSUPPORTED_DMO_SELECTION:
    'The target org passed to a DMO request is not valid. Pass --target-org with the alias or username of an authenticated org.',
  UNSUPPORTED_DMO_TARGET:
    'The plugin does not send this DMO write: a new DMO with a namespaced name, or a write to a DMO whose read has no name.',
};
