/** CLI hints for Identity resolution error codes. Long-form pages: docs/errors/identity-resolution/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  IDENTITY_RESOLUTION_ACQUISITION_FAILED:
    'The identity resolution ruleset could not be read from the org. Check the API name, your Data Cloud access and any Salesforce detail, then rerun the retrieve.',
  IDENTITY_RESOLUTION_ASYNC_DEPENDENTS:
    'The selection holds an identity resolution and a graph, calculated insight or Segment that uses its unified DMO, so --async cannot be used. Drop --async, or deploy the dependents in a later run.',
  IDENTITY_RESOLUTION_BINDING_UNQUALIFIED:
    'The DMOs and fields this ruleset uses, or the unified objects it creates, could not be verified in the target org. Check that they exist with the expected fields, then rerun.',
  IDENTITY_RESOLUTION_DATASPACE_MISMATCH:
    "The ruleset file's c__dataSpace, or the ruleset of that name in the org, is in another data space than the run. Rerun with the --dataspace the message names, or correct c__dataSpace.",
  IDENTITY_RESOLUTION_DATASPACE_UNREADABLE:
    'The org answered the read of the ruleset without a usable data space (dataSpaceName), so the plugin cannot tell where it is and wrote or changed nothing. Rerun; if it repeats, check the ruleset in Data Cloud.',
  IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED:
    'The ruleset could not be matched in the org, or its inputs and outputs could not be verified, so nothing was deleted. Check it in Data Cloud, then preview the delete again.',
  IDENTITY_RESOLUTION_DELETION_UNCONFIRMED:
    'The delete request was sent, but the absence of the ruleset could not be confirmed. Do not resend it; preview the delete or retrieve the ruleset to see whether it still exists.',
  IDENTITY_RESOLUTION_DEPENDENCY_OTHER_DATASPACE:
    "A DMO, DLO source or unified output the ruleset names is in another data space than the ruleset. Name the component of the ruleset's own data space (ds2_Individual__dlm with FirstName__c outside default), then rerun.",
  IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED:
    'Creating or updating a ruleset starts processing in Salesforce, and a create also adds unified objects to the org. Rerun with --allow-processing to accept this.',
  IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED:
    'Right before writing, a fresh check of the ruleset gave a different result than the first check, so the batch stopped. Preview again to see the current state, then rerun.',
  IDENTITY_RESOLUTION_IDENTITY_MISMATCH:
    'The org returned a ruleset whose name differs from the one requested, so no file was written. Check the exact ruleset API name, then rerun.',
  IDENTITY_RESOLUTION_NAME_NOT_STORED:
    "In a non-default data space Salesforce names a ruleset <prefix>_<type>_<rulesetId>; this file's name lacks the prefix, so a create could not be read back. Nothing was sent; rename the file and identity.apiName, or retrieve the ruleset.",
  IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH:
    'A new ruleset must be named after its configuration type, as <type> or <type>_<rulesetId> (with the data space prefix, <prefix>_<type>_<rulesetId>, outside default). Rename the file and its apiName to match, then rerun.',
  IDENTITY_RESOLUTION_NATIVE68_ADMISSION_FAILED:
    'The ruleset, its inputs or the target could not be verified before the write, so nothing was changed. Check the file, the referenced DMOs and the org, then rerun with --preview.',
  IDENTITY_RESOLUTION_NATIVE68_MUTATION_UNCONFIRMED:
    'The ruleset write was sent, but its result could not be confirmed. Do not resend it blindly; rerun the same deploy with --preview to see the current state.',
  IDENTITY_RESOLUTION_NOT_SETTLED:
    'The ruleset is still publishing or deleting in the org, so it cannot be changed now. Wait until it settles, then rerun the same command.',
  IDENTITY_RESOLUTION_TARGET_UNQUALIFIED:
    'The ruleset could not be looked up in the target org; the error was not a plain not found. Check your Data Cloud access and any Salesforce detail, then rerun.',
  IDENTITY_RESOLUTION_UPDATE_UNQUALIFIED:
    'The file changes the configuration type or secondary DMO of an existing ruleset, which an update cannot carry. Revert those fields, or delete the ruleset and deploy it again.',
  INCOMPLETE_IDENTITY_RESOLUTION:
    'The answer for the ruleset was incomplete, so no file was written. Rerun the retrieve; if it repeats, check the ruleset in Data Cloud.',
  PARTIAL_IDENTITY_RESOLUTION_OUTPUT:
    'The ruleset file was written, but the final check of it failed, so it may not match the org. Inspect the .identityResolution.json file and retrieve again.',
  UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION:
    'The ruleset lacks a required key or has a shape, value or name deploy cannot send. Retrieve keeps unknown keys and nulls, or writes the ruleset as-is; deploy refuses and names the key path.',
};
