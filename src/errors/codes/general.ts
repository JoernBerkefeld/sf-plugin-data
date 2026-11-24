/** CLI hints for General error codes. Long-form pages: docs/errors/general/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  ACQUISITION_FAILED:
    'The plugin could not read a DMO definition through the Metadata API. Check that the org session is valid and the DMO exists in the target, then rerun.',
  AUTHENTICATION_FAILED:
    'Salesforce rejected the session or the org could not be loaded. Check the org with sf org display, log in again with sf org login web if needed, then rerun.',
  BLOCKED_GIT_LIFECYCLE:
    'The Git changes include a rename (also one split across commit, index and worktree), a conflict or a deleted file the plugin cannot identify. Stage renames so Git can detect them, or select the files with --source-dir or -m.',
  CONFIRMATION_REQUIRED:
    'Deleting needs a yes at the confirmation question, and nobody could answer it here. Run the delete in a terminal, or pass --no-prompt after checking it with --preview.',
  CROSS_DATASPACE_COPY_CONFLICT:
    'The translated copy of a file would go to a path that already holds other content. Existing files are never changed, so nothing was sent. Move or remove that file, then rerun.',
  CROSS_DATASPACE_RULESETS_READ_FAILED:
    'A file of another data space names an identity resolution output, and the ruleset list that places it could not be read. Nothing was sent; check the org session, then rerun.',
  CROSS_DATASPACE_UNRESOLVED:
    "A name in a file of another data space cannot be placed in the run's data space by rule, so nothing was sent. Read which name and why, change the selection or the file, then rerun.",
  CROSS_DATASPACE_UNSUPPORTED:
    '--allow-cross-dataspace cannot translate this kind of file yet (STL transforms with an unknown node, transforms other than STL and DCSQL, streams). Nothing was sent. Deploy those in their own data space.',
  DATASPACE_READ_FAILED:
    'The list of data spaces could not be read completely from the org, so nothing was read or written. Check the org session and Data Cloud access, then rerun.',
  DELETE_CANCELLED:
    'The delete was not confirmed (no, no answer within 30 seconds, or the question failed), so nothing was sent. Rerun it and answer yes, or pass --no-prompt.',
  DELETE_FAILED:
    'The delete stopped for a reason without a more specific code. Read the message, check the item outcome and inspect the target before trying again; nothing is retried.',
  DELETE_PHASE_NOT_SETTLED:
    'Salesforce is still processing a deletion of this run, so the later phases were not started. Wait until it reads absent, then rerun the same delete.',
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
  DUPLICATE_IDENTITY:
    'Two selected files describe the same component. Keep one file per component in the selection, for example by narrowing --source-dir, then rerun.',
  EXECUTION_UNCONFIRMED:
    'A write was sent but its result could not be confirmed, so it may have taken effect. Inspect the target with retrieve or deploy --preview before running the deploy again.',
  HTML_ESCAPED_FILE:
    'The file holds HTML-escaped text (such as &amp; or &#39;) where the org holds the character itself; Salesforce would store the entities literally, so nothing was written. Retrieve the component again, or write the characters themselves.',
  INVALID_ASYNC_SCOPE:
    '--async works only when the selection contains an identity resolution. Remove --async, or select an identity-resolution file or -m identity-resolution:<Name>.',
  INVALID_DATASPACE_FIELD:
    'The c__dataSpace key of the file is missing or not valid: a data space name (for a data transform or data graph, the one its definition names), or for a DLO a list of names without repeats. Correct the file or retrieve it again.',
  INVALID_DRAFT_SCOPE:
    '--draft applies only to calculated insights at API auto or 68.0. Select only calculated insights and drop other API versions.',
  INVALID_FIELD_DELETE_SELECTION:
    '--field needs exactly one -m dmo:<Name__dlm> and no other selector, --changed-since or --delete-dlo; --output-dir works only with --field.',
  INVALID_GIT_SELECTION:
    'The --changed-since reference or the Git output could not be used. Pass a commit, branch or tag that exists locally and run the command inside the Git repository.',
  INVALID_OPTION:
    'A library call got options the Salesforce CLI would refuse while parsing its flags, so nothing was read or sent. Fix the options named in the message, then call again.',
  INVALID_REQUEST:
    'The plugin refused to build the Salesforce request from these inputs. Check --target-org, --api-version and the selected names, and that the org uses an https instance URL.',
  INVALID_SCOPE:
    'This family does not support the requested --api-version, or the run could not use the data space. Use --api-version auto (or a version the family allows), then rerun.',
  INVALID_SELECTION:
    'The selection is not valid for this command. Check the -m type:ApiName syntax, the --source-dir paths and flags that cannot be combined, then rerun.',
  INVALID_SOURCE:
    'A selected file is not a valid definition for its file type, or its content names a different component than its file name. Fix the file, or retrieve it again, then rerun.',
  INVALID_WAIT_SCOPE:
    '--wait applies only to a deploy that holds a data graph or to a segment publish, and must be whole minutes (1 or more). Remove it, or select a data graph or a segment.',
  LEGACY_DATASPACE_KEY:
    'The file still has an old data space key (identity.dataSpace, spec.segmentOn.dataSpace, or dataSpace in a calculated insight or an identity resolution reference). Move it to the top-level c__dataSpace key, or retrieve again.',
  LOCAL_FILE_REMOVAL_FAILED:
    'The deletion in the org is confirmed, but a local file was not removed. Do not repeat the delete; check the file named in the message and remove it yourself.',
  LOCAL_REFRESH_FAILED:
    'The fields were deleted in the org, but some project files were not refreshed. Do not repeat the delete; run sf data360 retrieve for the DMO and its mappings.',
  NATIVE_INVENTORY_FAILED:
    'Listing the DLOs, DMOs or mappings in the org failed, so nothing was retrieved. Check the org session and permissions in the message, then rerun or select exact type:ApiName members.',
  NATIVE_INVENTORY_UNCONFIRMED:
    'The list of DLOs or DMOs from the org could not be confirmed complete, so nothing was retrieved. Retrieve exact members with -m dmo:<Name> or -m dlo:<Name>, or rerun later.',
  NATIVE_PARENT_SETTLEMENT_UNCONFIRMED:
    'A parent DLO or DMO was written but could not be confirmed ready, so dependent items were not deployed. Wait, check the parent with deploy --preview, then rerun.',
  NATIVE_RETRIEVE_FAILED:
    'This DLO, DMO, mapping or relationship could not be retrieved for a reason without a more specific code. Read the message, check the org session, then rerun.',
  NOTHING_TO_DEPLOY:
    'Every selected file was a verbatim file and was skipped, so there was nothing to deploy and nothing was sent. Select files the plugin can represent, or retrieve the objects again.',
  OUTPUT_CHANGED:
    'The target file changed on disk while the plugin was writing it, so the write stopped. Make sure nothing else edits the project during the run, then rerun.',
  OUTPUT_FAILED:
    'The retrieved definition could not be written to the project. Check that the output folder is writable, has free space and that the temp folder settings are valid, then rerun.',
  OVERWRITE_REQUIRED:
    'A file of that name already exists in the project with other content. A deploy never changes an existing file when it writes a cross-data-space copy: compare the two, then move or remove the existing file and rerun.',
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
  STANDARD_RETRIEVE_UNKNOWN:
    'The Salesforce CLI process ended without an exit code, for example after a timeout or with too much output. Check that sf runs on its own, then rerun the retrieve.',
  TARGET_ORG_REQUIRED:
    'No usable target org was found. Pass --target-org <alias or username>, or set a default with sf config set target-org, then rerun.',
  UNKNOWN_DATASPACE:
    'The org has no data space of that name. Check --dataspace and the c__dataSpace values of the selected files against the data spaces the message lists.',
  UNMODELLED_RESPONSE:
    'Retrieve wrote this object as-is because the plugin could not read its answer from the org, and the check gave no more specific reason. Manage the object in Salesforce, or report the output.',
  UNSAFE_PATH:
    'The plugin refused a file path because it is a link, a hard-linked file, a folder or lies outside the allowed folder. Use plain files and folders inside the project, then rerun.',
  UNSAFE_SOURCE:
    'A selected source file is missing, linked, too large or changed while the plugin read it. Use plain files under 1 MiB and do not edit them during the run, then rerun.',
  UNSAFE_TEMP:
    'On Windows, TEMP, TMP, TMPDIR or the Node.js temp folder is not the temp folder the plugin accepts. Set them to the same absolute folder for this shell, then rerun.',
  UNSUPPORTED_DATASPACE_FILTER:
    'A c__dataSpace entry is a filtered membership ({name, filter}), which the plugin does not deploy yet. Use the plain data space name, or set the filter in the org.',
  VERBATIM_NOT_DEPLOYABLE:
    'The named file was retrieved as-is because the plugin cannot represent that object, so it cannot be deployed. Change the object in the org, or select a file the plugin can represent.',
};
