/** CLI hints for Mapping error codes. Long-form pages: docs/errors/mapping/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  AMBIGUOUS_MAPPING_PAIRS:
    "A mapping read at API 65 has a malformed or repeated field pair, so its pairs cannot be told apart. Check the mapping's field pairs in Data Cloud Setup.",
  AMBIGUOUS_MAPPING_TARGET:
    "More than one mapping in the org matches the same name or the same source DLO and target DMO, so the plugin cannot tell which one is meant. Inspect the DMO's mappings in the org.",
  AMBIGUOUS_PREREQUISITE_EVIDENCE:
    'The Metadata API did not return exactly one definition for the source or target object of a mapping. Check that the object exists once in the org, then rerun.',
  AMBIGUOUS_PREREQUISITE_FIELDS:
    'The source or target object of a mapping lists the same field twice, or a field without a name, so its fields could not be matched. Check the fields of the object in the org.',
  EVIDENCE_READ_FAILED:
    'The plugin could not read everything needed to export this mapping definition. Check the org session and that the mapping and its objects exist, then rerun.',
  INVALID_DEFINITION:
    'The mapping definition read from the org does not have the expected form, so it was not written. Check the mapping in the org, or retrieve it with -m mapping:<ApiName>.',
  INVALID_MAPPING_BINDING:
    'A mapping lookup was asked for a DMO or DLO name that is not a valid Name__dlm or Name__dll API name. Check the source and target object names of the mapping.',
  INVALID_MAPPING_BODY:
    "The mapping write request the plugin built did not have the expected shape, so it was not sent. Check the mapping file's pairs; if the file is valid, report the problem.",
  INVALID_MAPPING_CONFIGURATION:
    'A mapping read at API 65 was not a single object where one was expected. Check the mapping in Data Cloud Setup and read it with sf data360 retrieve instead.',
  INVALID_MAPPING_DOCUMENT:
    'The mapping file, or the mapping read from the org, does not match the mapping format. Check schemaVersion, kind, identity, the __dll and __dlm names and that fieldMappings is not empty.',
  INVALID_MAPPING_FIELD:
    'A field pair has an unknown key, a field name that is not Name__c, or repeats another pair or pair name. Fix the fieldMappings entries of the mapping file.',
  INVALID_MAPPING_NAME:
    'The mapping API name is not valid: it must start with a letter and use only letters, digits and underscores, at most 240 characters. Correct the mapping name.',
  INVALID_MAPPING_RESPONSE:
    'Salesforce answered a mapping request with a body the plugin could not read as a mapping. Rerun the command; if it repeats, inspect the mapping in the org.',
  INVALID_MAPPING_RUNTIME:
    'A mapping read at API 65 is not ACTIVE, has an unexpected name or object binding, or has no pairs or too many. Check the mapping in Data Cloud Setup.',
  INVALID_MAPPING_XML:
    "The mapping's Metadata API XML read at API 65 is too large, contains declarations, or is not one ObjectSourceTargetMap element. Check the mapping in Data Cloud Setup.",
  INVALID_PREREQUISITE_EVIDENCE:
    'A read of the source or target object of a mapping returned no usable record. Check that the object exists and that you can read it, then rerun.',
  INVALID_PREREQUISITE_FIELDS:
    'The source or target object of a mapping returned no field list, or more than 4096 fields. Check the object and its fields in the org, then rerun.',
  MAPPING_ACTIVATES_STANDARD_DMO:
    'This is the first mapping onto a standard DMO, and creating it enables that DMO permanently. Deleting the mapping later does not undo that; continue only if intended.',
  MAPPING_DATASPACE_COLLISION:
    'A local mapping file with this name already belongs to another data space, so it was not overwritten. Retrieve into another --output-dir or move the existing file.',
  MAPPING_DATASPACE_MISMATCH:
    "The mapping file's identity.dataSpace does not match the data space of this command. Make them match, or pass the right --dataspace.",
  MAPPING_DELETE_FAILED:
    'The Metadata API did not confirm the destructive deployment that deletes the mapping. Read the problems shown, check whether the mapping still exists, then fix the cause.',
  MAPPING_DELETE_SIDE_EFFECT:
    "The mapping was deleted, but the DMO's other mappings or its fields changed too. Inspect the DMO and its mappings in the org; nothing was rolled back.",
  MAPPING_DELETION_UNCONFIRMED:
    "The deletion was sent, but the mapping could still be read after the plugin's checks. Do not repeat the delete at once; read the mapping again later to see if it is gone.",
  MAPPING_DEPENDENCIES_PLANNED:
    "The mapping's source DLO or target DMO is created earlier in this same deploy, so the preview cannot compare the mapping yet. Run the deploy to check it after its parents.",
  MAPPING_DEPENDENCY_IDENTITY_MISMATCH:
    "The source DLO or target DMO read from the org did not match the name or data space the mapping names. Check the mapping's object names and data space, then rerun.",
  MAPPING_FIELD_NOT_FOUND:
    'A field pair names a field that does not exist on the source DLO or the target DMO. Create the field first or correct the pair in the mapping file.',
  MAPPING_FIELD_TYPES_DIFFER:
    'Some pairs map fields of different data types. Salesforce accepts this; check the listed pairs if the difference is not intended.',
  MAPPING_GENERATED_PAIRS_UNPROVEN:
    'The mapping was not saved: its source DLO or target DMO could not be read to leave out the pairs Salesforce generates. Check both objects exist and are readable, then rerun.',
  MAPPING_HTTP_ERROR:
    'Salesforce rejected a mapping request with an HTTP error. Read the status and API detail in the message, fix the cause (name, access, org state), then rerun.',
  MAPPING_INVENTORY_BINDING_MISMATCH:
    'Listing the mappings of a DMO returned a mapping that targets a different DMO, so the list cannot be trusted. Rerun the retrieve; if it repeats, select mappings by name.',
  MAPPING_INVENTORY_UNCONFIRMED:
    "The list of the DMO's mappings could not be confirmed against the individual mapping reads. Wait for pending mapping changes to finish, then rerun.",
  MAPPING_INVENTORY_UNQUALIFIED:
    'Retrieving all mappings is not supported together with the other selected families. Select mappings by name (mapping:<Name>) or retrieve mapping in its own run.',
  MAPPING_LAST_MAPPING_DELETE_BLOCKED:
    'Salesforce does not delete the last mapping of a custom DMO. Delete the DMO instead (sf data360 delete --metadata dmo:<Name>__dlm), which removes its mapping too.',
  MAPPING_PAIR_MISMATCH:
    'A mapping read at API 65 has Metadata API XML whose pairs or objects do not match its runtime detail. Check the mapping in Data Cloud Setup.',
  MAPPING_PARENTS_REQUIRED:
    "The plugin had no way to read the mapping's source DLO and target DMO, so it could not leave out generated pairs. This is a plugin fault; report it with the command you ran.",
  MAPPING_PARENT_CHANGED:
    'The source DLO or target DMO changed while the mapping was being updated. Let other changes finish, inspect the mapping in the org, then rerun the deploy.',
  MAPPING_PERSISTENCE_UNCONFIRMED:
    'The mapping write was sent, but reading it back did not show the expected pairs. Inspect the mapping in the org before deploying again; nothing was retried or rolled back.',
  MAPPING_PROTECTED_LAYOUT_UNPROVEN:
    'The plugin could not prove which pairs of this mapping must stay (key, key qualifier and system pairs), so it removes none. Keep those pairs, or change the mapping in the org.',
  MAPPING_PROTECTED_PAIR_REQUIRED:
    'The mapping file leaves out a pair that must never be unmapped, such as the primary key pair. Add that pair back to fieldMappings and rerun.',
  MAPPING_REQUEST_UNCONFIRMED:
    'The plugin could not confirm how Salesforce answered a mapping request. Inspect the mapping in the org before running the command again; nothing was retried.',
  MAPPING_SELECTOR_REQUIRED:
    'A mapping pair read from the org has no pair name, so it cannot be removed on its own. Rerun later; if it persists, change the mapping in Data Cloud Setup.',
  MAPPING_TARGET_BINDING_MISMATCH:
    "The mapping found in the org binds a different source DLO, target DMO or data space than the mapping file. Check the file's binding against the org before deploying.",
  MAPPING_TARGET_IDENTITY_MISMATCH:
    'Salesforce returned a mapping with a different name than the one requested, so the result was not trusted. Rerun the command; if it repeats, check the mapping name in the org.',
  MAPPING_TARGET_NOT_SETTLED:
    'The mapping in the org is not ACTIVE yet, for example because Salesforce is still processing an earlier change. Wait until it is ACTIVE, then rerun.',
  MAPPING_TARGET_UNSUPPORTED:
    'The target DMO is platform-generated, untyped or a namespaced custom DMO, which this plugin does not write mappings to. Map onto a custom or standard DMO instead.',
  MAPPING_UNMAP_PERSISTENCE_UNCONFIRMED:
    "A field pair was removed, but reading the mappings back did not confirm the expected result. Inspect the DMO's mappings in the org before trying again; nothing was rolled back.",
  MAPPING_UNMAP_PLAN_CHANGED:
    "The DMO's mappings changed between planning and the first write, so nothing was removed. Rerun the command to plan again against the current org.",
  PARTIAL_MAPPING_OUTPUT:
    'The mapping file was written, but checking it afterwards failed, so its content may be incomplete. Inspect the file, delete it if needed, and rerun the retrieve with --overwrite.',
  PREREQUISITE_FIELD_CORRELATION_FAILED:
    'The two reads of the source or target object of a mapping list different fields, or a mapped field is missing. Check the fields of the object in the org, then rerun.',
  PREREQUISITE_IDENTITY_MISMATCH:
    'A read of the source or target object of a mapping returned a different object name than requested. Check the API name of the object in the org, then rerun.',
  UNKNOWN_MAPPING_CONFIGURATION:
    'A mapping read at API 65 has keys the plugin does not know, or lacks keys it needs. Check the mapping in Data Cloud Setup and read it with sf data360 retrieve instead.',
  UNKNOWN_MAPPING_XML:
    "The mapping's Metadata API XML read at API 65 has elements the plugin does not know, repeats one, or lacks one it needs. Check the mapping in Data Cloud Setup.",
  UNSUPPORTED_MAPPING_DATASPACE:
    'Salesforce reported the mapping in a different data space than the one this command works in. Rerun with that data space in --dataspace, or select a mapping of this data space.',
  UNSUPPORTED_MAPPING_SELECTION:
    'The target org value cannot be passed on safely: it is empty, starts with a dash or contains control characters. Pass a valid alias or username with --target-org.',
  UNSUPPORTED_MAPPING_SEMANTICS:
    'A mapping read at API 65 uses pair options the plugin does not handle, such as filters or formula sources. Check the mapping in Data Cloud Setup.',
};
