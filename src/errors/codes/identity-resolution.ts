/** CLI hints for Identity resolution error codes. Long-form pages: docs/errors/identity-resolution/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  IDENTITY_RESOLUTION_ACQUISITION_FAILED:
    'The identity resolution ruleset could not be read from the org. Check the API name, your Data Cloud access and any Salesforce detail, then rerun the retrieve.',
  IDENTITY_RESOLUTION_BINDING_UNQUALIFIED:
    'The DMOs and fields this ruleset uses, or the unified objects it creates, could not be verified in the target org. Check that they exist with the expected fields, then rerun.',
  IDENTITY_RESOLUTION_DELETE_ADMISSION_FAILED:
    'The ruleset in the org does not match the file, or its inputs and outputs could not be verified, so nothing was deleted. Retrieve it again, compare with the file, then rerun.',
  IDENTITY_RESOLUTION_DELETION_UNCONFIRMED:
    'The delete request was sent, but the absence of the ruleset could not be confirmed. Do not resend it; preview the delete or retrieve the ruleset to see whether it still exists.',
  IDENTITY_RESOLUTION_EFFECT_ACKNOWLEDGEMENT_REQUIRED:
    'Creating or updating a ruleset starts processing in Salesforce, and a create also adds unified objects to the org. Rerun with --allow-processing to accept this.',
  IDENTITY_RESOLUTION_FRESH_ADMISSION_BLOCKED:
    'Right before writing, a fresh check of the ruleset gave a different result than the first check, so the batch stopped. Preview again to see the current state, then rerun.',
  IDENTITY_RESOLUTION_IDENTITY_MISMATCH:
    'The org returned a ruleset whose name or data space differs from the one requested, so no file was written. Check the exact ruleset API name, then rerun.',
  IDENTITY_RESOLUTION_INVENTORY_UNQUALIFIED:
    'Retrieving all identity resolution rulesets at once is not supported. Name each ruleset with --metadata identity-resolution:<Name>.',
  IDENTITY_RESOLUTION_NAME_TYPE_MISMATCH:
    'A new ruleset must be named after its configuration type, as <type> or <type>_<rulesetId>. Rename the file and its apiName to match, then rerun.',
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
    'The ruleset file was written, but the final check of it failed, so it may not match the org. Inspect the .identityResolution.json file and retrieve again with --overwrite.',
  UNSUPPORTED_IDENTITY_RESOLUTION_CONFIGURATION:
    'The ruleset returned by the org has a shape or size the plugin cannot check, so no file was written. Check the ruleset in Data Cloud, for example its reconciliation rules.',
};
