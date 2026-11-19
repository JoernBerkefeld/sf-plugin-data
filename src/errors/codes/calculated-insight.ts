/** CLI hints for Calculated insight error codes. Long-form pages: docs/errors/calculated-insight/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  CI_ACQUISITION_FAILED:
    'The calculated insight list from the target org could not be read completely. Check access to the org, then rerun the retrieve.',
  CI_ADMISSION_FAILED:
    'The calculated insight file or its read from the org did not pass, so nothing was sent. Run the command with --preview, fix the file, data space or target access, then rerun.',
  CI_DATASPACE_MISMATCH:
    "The calculated insight file's c__dataSpace is not the data space of the run. Run with the --dataspace the file names, or correct c__dataSpace, then rerun.",
  CI_DELETION_UNCONFIRMED:
    'The DELETE was sent but the plugin could not confirm the calculated insight is gone. Do not resend; check the org, then rerun the delete to confirm absence.',
  CI_IDENTITY_CHANGED:
    'The calculated insight in the org has a different API name or data space than selected. Nothing was written or sent; check the selector and the JSON file, then rerun.',
  CI_INPUT_DRIFT:
    'The delete options changed while the command was running, so nothing was deleted. Rerun the delete once with the intended flags.',
  CI_MUTATION_UNCONFIRMED:
    'The deploy request was sent but the plugin could not confirm the result. Do not resend; preview or retrieve the calculated insight to see its state first.',
  CI_NOT_FOUND:
    'The calculated insight does not exist in the target org. Check the API name and the target org, then rerun the retrieve.',
  CI_PUBLICATION_UNCONFIRMED:
    'The publish request was sent but the plugin could not confirm the calculated insight is ACTIVE. Do not resend; run publish with --preview to check its state.',
  CI_PUBLISH_STARTED:
    'With --async the publish was sent and Salesforce accepted it; the command did not wait until the calculated insight is ACTIVE. Run publish with --preview later: unchanged means it is ACTIVE.',
  CI_RUNTIME_UNKNOWN:
    'The calculated insight could not be read from the org, and the answer was not a clear not-found. Check access and the API name, then rerun.',
  CI_SETTLEMENT_MISMATCH:
    'After the write, the calculated insight in the org differs from the files that were sent. Do not resend; retrieve it and compare before another attempt.',
  CI_SETTLEMENT_TIMEOUT:
    'The calculated insight did not reach the expected state within 120 seconds after the write. Do not resend; check later and rerun the same command to confirm.',
  CI_UNEXPECTED_ABSENCE:
    'After the write, the calculated insight was not found in the org. Do not resend; check the org, then rerun the same command to see the current state.',
  CI_UNEXPECTED_STATE:
    'After the write, the calculated insight moved to an unexpected status. Do not resend; check its status in Data 360 before another attempt.',
  CI_VISUAL_DRAFT_WITHOUT_SQL:
    'A Visual Builder draft has no SQL in the API until it is published (Salesforce returns a placeholder instead). Retrieve wrote it as-is without a SQL file, and deploy refuses that file; publish it in Data Cloud, then retrieve it again.',
  INVALID_CI_DOCUMENT:
    'The calculated insight document lacks its API name, data space or SQL, or is not a JSON object. Retrieve the calculated insight again.',
  INVALID_CI_NAME:
    'The calculated insight API name is not valid. Use the full API name that starts with a letter and ends in __cio, for example ExampleInsight__cio.',
  INVALID_CI_SCOPE:
    'The calculated insight request used an unsupported API version, data space name or option. Use --api-version auto or 68.0 and a valid data space name.',
  PARTIAL_CI_OUTPUT:
    'Only one of the two calculated insight files was written to disk. Check the JSON and SQL files, then rerun the retrieve with --overwrite.',
};
