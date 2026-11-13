/** CLI hints for General error codes. Long-form pages: docs/errors/general/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  ACQUISITION_FAILED:
    'The plugin could not read a DMO definition through the Metadata API. Check that the org session is valid and the DMO exists in the target, then rerun.',
  AUTHENTICATION_FAILED:
    'Salesforce rejected the session or the org could not be loaded. Check the org with sf org display, log in again with sf org login web if needed, then rerun.',
  BLOCKED_GIT_LIFECYCLE:
    'The Git changes include a rename, a conflict or a deleted file the plugin cannot identify. Stage renames so Git can detect them, or deploy the files with --source-dir or -m.',
  DELETE_FAILED:
    'The delete stopped for a reason without a more specific code. Read the message, check the item outcome and inspect the target before trying again; nothing is retried.',
  DEPLOY_EXECUTION_BLOCKED:
    'At least one item was blocked, so the deploy stopped before or between writes. Read the item lines above for the reason, fix it, then rerun the same deploy.',
  DEPLOY_EXECUTION_FAILED:
    'The deploy failed and a write may already have happened. Read the item lines, inspect the target with retrieve or deploy --preview, then decide whether to rerun.',
  DEPLOY_FRESH_ADMISSION_BLOCKED:
    'Right before writing this item, a fresh check found something different from the earlier check, so it and later items were not written. Run deploy --preview to see the current state, then rerun.',
  DEPLOY_PREVIEW_BLOCKED:
    'The preview found at least one item that a deploy would refuse. Read the item lines above for the reason and fix it before running the deploy without --preview.',
  DEPLOY_PREVIEW_FAILED:
    'The preview could not finish. Read the message for the cause, such as session, selection or target access, fix it and run the preview again. Nothing was written.',
  DESTRUCTIVE_CONFIRMATION_REQUIRED:
    'Deleting this component needs explicit confirmation. Check the target with --preview first, then rerun the delete with --confirm-delete.',
  DUPLICATE_IDENTITY:
    'Two selected files describe the same component. Keep one file per component in the selection, for example by narrowing --source-dir, then rerun.',
  EXECUTION_UNCONFIRMED:
    'A write was sent but its result could not be confirmed, so it may have taken effect. Inspect the target with retrieve or deploy --preview before running the deploy again.',
  INVALID_ASYNC_SCOPE:
    '--async works only when the selection contains an identity resolution. Remove --async, or select an identity-resolution file or -m identity-resolution:<Name>.',
  INVALID_DRAFT_SCOPE:
    '--draft applies only to calculated insights at API auto or 68.0 in the default data space. Select only calculated insights and drop --dataspace and other API versions.',
  INVALID_FIELD_DELETE_SELECTION:
    '--field needs exactly one -m dmo:<Name__dlm> and no other selector, --source-dir, --delete-dlo or --transform-target-id; --output-dir works only with --field.',
  INVALID_GIT_SELECTION:
    'The --changed-since reference or the Git output could not be used. Pass a commit, branch or tag that exists locally and run the command inside the Git repository.',
  INVALID_PROJECT:
    'sfdx-project.json does not name one usable package directory. Give packageDirectories exactly one default entry with a relative path inside the project, then rerun.',
  INVALID_REQUEST:
    'The plugin refused to build the Salesforce request from these inputs. Check --target-org, --api-version and the selected names, and that the org uses an https instance URL.',
  INVALID_SCOPE:
    'This family does not support the requested --api-version or --dataspace. Use --api-version auto (or a version the family allows) and the default data space, then rerun.',
  INVALID_SELECTION:
    'The selection is not valid for this command. Check the -m type:ApiName syntax, the --source-dir paths and flags that cannot be combined, then rerun.',
  INVALID_SOURCE:
    'A selected file is not a valid definition for its file type, or its content names a different component than its file name. Fix the file, or retrieve it again, then rerun.',
  INVALID_STANDARD_RETRIEVE:
    'The Salesforce CLI retrieve that fetches the source XML returned output the plugin could not use. Run sf project retrieve start for the same member to see the error, then rerun.',
  INVALID_WAIT_TIMEOUT_SCOPE:
    '--wait-timeout applies only to a deploy of exactly one data graph, given in whole seconds. Remove it, or select a single data graph without --changed-since.',
  LOCAL_FILE_REMOVAL_FAILED:
    'The deletion in the org is confirmed, but a local file was not removed. Do not repeat the delete; check the file named in the message and remove it yourself.',
  LOCAL_REFRESH_FAILED:
    'The fields were deleted in the org, but some project files were not refreshed. Do not repeat the delete; run sf data360 retrieve with --overwrite for the DMO and its mappings.',
  METADATA_REDIRECT_REFUSED:
    'Salesforce answered a Metadata API read with a redirect, which the plugin does not follow. Check the My Domain and instance URL of the org, log in again, then rerun.',
  NATIVE_INVENTORY_FAILED:
    'Listing the DLOs, DMOs or mappings in the org failed, so nothing was retrieved. Check the org session and permissions in the message, then rerun or select exact type:ApiName members.',
  NATIVE_INVENTORY_UNCONFIRMED:
    'The list of DLOs or DMOs from the org could not be confirmed complete, so nothing was retrieved. Retrieve exact members with -m dmo:<Name> or -m dlo:<Name>, or rerun later.',
  NATIVE_MIXED_SELECTION_UNSUPPORTED:
    'Mappings and relationships deploy only together with DLO, DMO, mapping and relationship inputs. Deploy other families in a separate run.',
  NATIVE_PARENT_SETTLEMENT_UNCONFIRMED:
    'A parent DLO or DMO was written but could not be confirmed ready, so dependent items were not deployed. Wait, check the parent with deploy --preview, then rerun.',
  NATIVE_RETRIEVE_FAILED:
    'This DLO, DMO, mapping or relationship could not be retrieved for a reason without a more specific code. Read the message, check the org session, then rerun.',
  OUTPUT_CHANGED:
    'The target file changed on disk while the plugin was writing it, so the write stopped. Make sure nothing else edits the project during the run, then rerun.',
  OUTPUT_FAILED:
    'The retrieved definition could not be written to the project. Check that the output folder is writable, has free space and that the temp folder settings are valid, then rerun.',
  OVERWRITE_REQUIRED:
    'A different version of this file already exists in the project. Compare it with the org, then rerun with --overwrite (-x) to replace it, or keep your local file.',
  PREFLIGHT_FAILED:
    'Checking this item against the target failed, so nothing was deployed. Read the message for the cause, such as session, permissions or input, fix it and run deploy --preview again.',
  PROCESSING_ACKNOWLEDGEMENT_REQUIRED:
    'This create or update starts processing in Data Cloud and needs your explicit consent. Check it with --preview, then rerun with --allow-processing.',
  REMOVE_FAILED:
    'Removing this local file failed after a confirmed deletion. Close programs that hold the file, check permissions, then delete it yourself; do not repeat the delete.',
  REQUEST_FAILED:
    'Salesforce rejected or did not complete a request. Read the HTTP status and request ID in the message, fix the cause such as permissions, a missing object or limits, then rerun.',
  RETRIEVE_FAILED:
    'Retrieval stopped for a reason without a more specific code. Read the message, check the org session and output folder, then rerun the retrieve.',
  STANDARD_CLI_UNAVAILABLE:
    'The globally installed Salesforce CLI npm package was not found. Install it with npm install --global @salesforce/cli, then rerun the retrieve.',
  STANDARD_RETRIEVE_UNCONFIRMED:
    'The Salesforce CLI did not report a clean, successful retrieve of the source XML. Run sf project retrieve start for the same member to see its errors or warnings, then rerun.',
  STANDARD_RETRIEVE_UNKNOWN:
    'The Salesforce CLI process ended without an exit code, for example after a timeout or with too much output. Check that sf runs on its own, then rerun the retrieve.',
  TARGET_ORG_REQUIRED:
    'No usable target org was found. Pass --target-org <alias or username>, or set a default with sf config set target-org, then rerun.',
  UNEXPECTED_METADATA_MEMBERS:
    'The Salesforce CLI retrieve returned other files than the one requested source file. Check the member name in the org, then rerun the retrieve.',
  UNSAFE_PATH:
    'The plugin refused a file path because it is a link, a hard-linked file, a folder or lies outside the allowed folder. Use plain files and folders inside the project, then rerun.',
  UNSAFE_SOURCE:
    'A selected source file is missing, linked, too large or changed while the plugin read it. Use plain files under 1 MiB and do not edit them during the run, then rerun.',
  UNSAFE_TEMP:
    'On Windows, TEMP, TMP, TMPDIR or the Node.js temp folder is not the temp folder the plugin accepts. Set them to the same absolute folder for this shell, then rerun.',
};
