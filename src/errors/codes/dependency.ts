/** CLI hints for Dependency error codes. Long-form pages: docs/errors/dependency/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  DEPENDENCIES_PLANNED:
    'A parent of this item is created earlier in the same deploy, or a dependent is deleted earlier in the same delete, so the preview does not check the item yet. No action is needed.',
  DEPENDENCY_ACQUISITION_FAILED:
    'A selected DMO or segment, or an object a segment uses, could not be read from the org. Check the names and your access, then rerun the retrieve.',
  DEPENDENCY_CLOSURE_UNSUPPORTED:
    'The definition of a retrieved DMO could not be checked for the components it depends on, so nothing was written. Check the DMO in the org, then rerun.',
  DEPENDENCY_CYCLE:
    'The selected components depend on each other in a loop, so no safe order exists. Split the selection or remove the circular reference, then rerun.',
  DEPENDENCY_DUPLICATE_IDENTITY:
    'Two selected files define the same component (same type and API name). Keep one file per component in the selection, then rerun.',
  DEPENDENCY_IDENTITY_UNSUPPORTED:
    'A selected component, or one it refers to, has an unsupported type, a data space other than default, or an invalid API name. Fix the reference, then rerun.',
  DEPENDENCY_INPUT_CHANGED:
    'A selected file changed on disk while the command was running. Finish editing, then rerun the deploy.',
  DEPENDENCY_LIMIT_EXCEEDED:
    'The selection has more than 256 components or 512 dependency links. Split it into smaller selections and run them one after another.',
  DEPENDENCY_REQUEST_LIMIT_EXCEEDED:
    'Retrieving this selection would need more than 512 reads from the org. Retrieve fewer DMOs or segments per command.',
};
