/** CLI hints for Relationship error codes. Long-form pages: docs/errors/relationship/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  AMBIGUOUS_RELATIONSHIP_TARGET:
    'More than one relationship in the org links the same source and target fields, so the plugin cannot tell which one the file means. Delete the extra one by name, then rerun.',
  INVALID_RELATIONSHIP_BINDING:
    'A DMO name used to list relationships is not a valid DMO API name. Check the relationship:Name__dlm selector or the source object in the relationship file.',
  INVALID_RELATIONSHIP_DOCUMENT:
    'A relationship does not fit the file format: objects must be DMO API names, fields custom field API names, and cardinality and owner must be set. Check it in the org.',
  INVALID_RELATIONSHIP_NAME:
    'The relationship name is not a valid API name: it must start with a letter and use only letters, digits and underscores. Use the exact name from the org.',
  INVALID_RELATIONSHIP_RESPONSE:
    'Salesforce answered the relationship list in a shape the plugin does not expect. Rerun the command; if it repeats, inspect the raw list response for the DMO.',
  PARTIAL_RELATIONSHIP_OUTPUT:
    'The relationship file was written, but a later step of saving it failed, so the file may not be complete. Inspect it under data360/relationship and retrieve again with --overwrite.',
  RELATIONSHIP_CHANGE_UNSUPPORTED:
    'The relationship exists with a different cardinality or owner, and Salesforce cannot change it. Delete it with sf data360 delete -m relationship:SourceDmo__dlm:Name, then deploy the file again.',
  RELATIONSHIP_DATASPACE_COLLISION:
    'A local file with this relationship name was saved from a different data space. Retrieve into a separate project folder, or remove the old file first.',
  RELATIONSHIP_DELETION_UNCONFIRMED:
    "The relationship delete was sent, but the relationship still appears in the source DMO's list. Check it in the org before deleting again; nothing is retried.",
  RELATIONSHIP_DEPENDENCIES_PLANNED:
    'This batch creates a DMO the relationship uses, so the preview cannot compare the relationship yet. No action is needed; the deploy checks it after the DMO exists.',
  RELATIONSHIP_FILE_IDENTITY_MISMATCH:
    "The relationship definition the delete checks names a different relationship than the one selected. Nothing was deleted; with --changed-since, fix the deleted file's content, otherwise report it.",
  RELATIONSHIP_HTTP_ERROR:
    'Salesforce rejected a relationship request with an HTTP error. Read the status and API detail in the message; for a create, both DMOs must already be mapped.',
  RELATIONSHIP_INVENTORY_INCOMPLETE:
    'The relationship list of the DMO did not add up (page count, total or duplicate names), possibly because it changed during the read. Rerun the command.',
  RELATIONSHIP_INVENTORY_UNQUALIFIED:
    'Retrieving every relationship of the org is not supported. Select a source DMO with -m relationship:Name__dlm to retrieve the relationships that start from it.',
  RELATIONSHIP_NAME_MISMATCH:
    "No relationship has this name, but another one carries the file's binding. Retrieve the source DMO's relationships and delete that one by its name.",
  RELATIONSHIP_PERSISTENCE_UNCONFIRMED:
    "The relationship create was sent, but it did not read back as active with the requested settings in time. Check the source DMO's relationships before deploying again.",
  RELATIONSHIP_REQUEST_UNCONFIRMED:
    "A relationship request ended without a clear HTTP result. For a create or delete, list the source DMO's relationships before trying again; nothing is retried.",
  RELATIONSHIP_TARGET_BINDING_MISMATCH:
    'The relationship with this name links other objects or fields than expected: another source DMO than the selector names, or with --changed-since another binding than the deleted file. Check it before deleting.',
  UNSUPPORTED_RELATIONSHIP_DATASPACE:
    "The file's data space does not match the command's data space. Set --dataspace to the identity.dataSpace of the file, or leave it out for the default data space.",
  UNSUPPORTED_RELATIONSHIP_SELECTION:
    'The target org value cannot be passed on to Salesforce CLI. Use a plain org alias or username with --target-org.',
};
