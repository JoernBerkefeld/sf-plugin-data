/** CLI hints for Calculated insight error codes. Long-form pages: docs/errors/calculated-insight/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  CI_ACQUISITION_FAILED:
    'The calculated insight could not be read and checked in the target org. Check access to the org and the API name, then rerun the retrieve.',
  CI_ADMISSION_FAILED:
    "The plugin's checks of the calculated insight pair, target or dependencies did not pass, so nothing was sent. Run the command with --preview, fix the input or target, then rerun.",
  CI_ATTRIBUTION_UNQUALIFIED:
    'A dimension or measure in the org is attributed to a source field the artifact cannot hold. Nothing was written; this calculated insight cannot be retrieved by the plugin.',
  CI_CONFIGURATION_UNQUALIFIED:
    'The calculated insight settings, such as its schedule, are outside what the plugin supports here. Nothing was written or sent; writes need NOT_SCHEDULED and the other fields as retrieved.',
  CI_DELETION_UNCONFIRMED:
    'The DELETE was sent but the plugin could not confirm the calculated insight is gone. Do not resend; check the org, then rerun the delete to confirm absence.',
  CI_DEPENDENCY_AMBIGUOUS:
    'The DMO the calculated insight reads could not be identified uniquely in the target org. Check the DMO and its field list in Data 360, then rerun.',
  CI_DEPENDENCY_UNQUALIFIED:
    'The DMO the calculated insight reads is missing, disabled or has fields of the wrong type in the target org. Fix the DMO and its mapped Text fields, then rerun.',
  CI_EXPRESSION_UNQUALIFIED:
    'The calculated insight SQL is not one of the expressions the plugin supports. Nothing was written or sent; this calculated insight cannot be handled by the plugin.',
  CI_FRESH_ADMISSION_BLOCKED:
    'The last check right before writing the calculated insight gave a different result than the plan. Nothing was sent; rerun deploy with --preview and review the plan.',
  CI_IDENTITY_CHANGED:
    'The calculated insight in the org has a different API name or data space than selected. Nothing was written or sent; check the selector and the pair, then rerun.',
  CI_INPUT_DRIFT:
    'The delete options changed while the command was running, so nothing was deleted. Rerun the delete once with the intended flags.',
  CI_INVENTORY_UNQUALIFIED:
    'Retrieving all calculated insights at once is not supported. Select each one with -m calculated-insight:Name__cio.',
  CI_METADATA_AMBIGUOUS:
    'The Metadata API definition of the calculated insight is missing or does not match the native read. Nothing was written or sent; check the calculated insight in the org and rerun.',
  CI_METADATA_MISMATCH:
    'The native and Metadata API definitions of the calculated insight disagree on label, SQL or type. Nothing was written or sent; wait for the org to settle and rerun.',
  CI_MUTATION_UNCONFIRMED:
    'The deploy request was sent but the plugin could not confirm the result. Do not resend; preview or retrieve the calculated insight to see its state first.',
  CI_NON_EXPRESSION_CHANGE:
    'The pair changes more than the SQL expression of an existing calculated insight. Only the expression can be updated; set the other fields back to the org values.',
  CI_NOT_ACTIVE:
    'The calculated insight is not ACTIVE; it is a draft or still processing. Publish it or wait for processing to finish, then rerun the retrieve.',
  CI_NOT_FOUND:
    'The calculated insight does not exist in the target org. Check the API name and the target org, then rerun the retrieve.',
  CI_NOT_SETTLED:
    'The calculated insight is in a status the plugin cannot use here, such as deleting or an error. Wait until it is ACTIVE or DRAFT, then rerun.',
  CI_PAIR_MISMATCH:
    'The XML and JSON files of the calculated insight pair do not match in name, label, SQL or type. Retrieve the pair again so both files agree.',
  CI_PUBLICATION_UNCONFIRMED:
    'The publish request was sent but the plugin could not confirm the calculated insight is ACTIVE. Do not resend; run publish with --preview to check its state.',
  CI_RUNTIME_PROFILE_UNQUALIFIED:
    'The calculated insight is packaged or has run, schedule or source details the plugin cannot handle for this command. Nothing was written or sent; manage it in Data 360.',
  CI_RUNTIME_UNKNOWN:
    'The calculated insight could not be read from the org, and the answer was not a clear not-found. Check access and the API name, then rerun.',
  CI_SCHEMA_UNQUALIFIED:
    'The dimensions or measures of the calculated insight do not match its supported SQL. Nothing was written or sent; this calculated insight cannot be handled as is.',
  CI_SETTLEMENT_FAILED:
    'The plugin could not finish checking the result after the write. Do not resend; inspect the calculated insight in the org before another attempt.',
  CI_SETTLEMENT_MISMATCH:
    'After the write, the calculated insight in the org differs from the pair that was sent. Do not resend; retrieve it and compare before another attempt.',
  CI_SETTLEMENT_TIMEOUT:
    'The calculated insight did not reach the expected state within 120 seconds after the write. Do not resend; check later and rerun the same command to confirm.',
  CI_UNEXPECTED_ABSENCE:
    'After the write, the calculated insight was not found in the org. Do not resend; check the org, then rerun the same command to see the current state.',
  CI_UNEXPECTED_STATE:
    'After the write, the calculated insight moved to an unexpected status. Do not resend; check its status in Data 360 before another attempt.',
  INVALID_CI_DOCUMENT:
    'The calculated insight JSON is not a valid document: wrong shape, name, data space or text. Retrieve the pair again instead of editing its structure.',
  INVALID_CI_NAME:
    'The calculated insight API name is not valid. Use the full API name that starts with a letter and ends in __cio, for example ExampleInsight__cio.',
  INVALID_CI_SCOPE:
    'The calculated insight request used an unsupported API version, data space or option. Use --api-version auto or 68.0 and the default data space.',
  INVALID_CI_XML:
    'The calculated insight XML is malformed or has elements the plugin does not support. Retrieve the pair again; only creationType, expression and masterLabel are allowed.',
  PARTIAL_CI_OUTPUT:
    'Only part of the calculated insight pair was written to disk. Check both files, then rerun the retrieve with --overwrite to write a matching pair.',
  UNKNOWN_CI_CONFIGURATION:
    'The calculated insight has fields that are missing or unknown to the plugin. Nothing was written or sent; retrieve the pair again and do not add or remove fields.',
};
