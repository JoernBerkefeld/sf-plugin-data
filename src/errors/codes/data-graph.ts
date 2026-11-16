/** CLI hints for Data graph error codes. Long-form pages: docs/errors/data-graph/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  DATA_GRAPH_CREATE_UNCONFIRMED:
    'The graph create request was sent, but the graph could not be confirmed in time. It may exist: retrieve it or rerun the same deploy before changing anything.',
  DATA_GRAPH_DRAFT:
    'The data graph is a draft that was never built, so it was retrieved as-is. A draft cannot be deployed or edited through the API; build or edit it in Salesforce. A delete removes it.',
  DATA_GRAPH_IDENTITY_MISMATCH:
    'The org answered the read of a data graph with a different graph name than the one selected. Check the exact name, including case, in --metadata data-graph:<Name> and in the file, then rerun.',
  DATA_GRAPH_OWNER:
    'The graph root is a unified DMO created by the named identity resolution ruleset, which is published. No action is needed.',
  DATA_GRAPH_OWNER_NOT_FOUND:
    'The graph root is a unified DMO, but no identity resolution ruleset in the target creates it. Deploy the ruleset that produces it first, then preview the graph again.',
  DATA_GRAPH_OWNER_NOT_PUBLISHED:
    'The identity resolution ruleset that creates the graph root is not published yet. Wait until it is PUBLISHED (rerun its deploy to check), then preview the graph again.',
  DATA_GRAPH_PENDING:
    'A data graph of that name is still being built, or was just deleted and is still listed, so the deploy cannot write it now. Wait a few minutes, then rerun the same deploy.',
  DATA_GRAPH_ROOT_NOT_FOUND:
    'The root DMO of the graph does not exist in the target org. Deploy that DMO, or the identity resolution ruleset that creates it, then preview the graph again.',
  INVALID_NATIVE_DATA_GRAPH_NAME:
    'The data graph name is not a valid API name. Use a name that starts with a letter and has only letters, digits and underscores, at most 200 characters.',
  INVALID_NATIVE_DATA_GRAPH_SCOPE:
    'Data graphs work only with API version 68.0 in the default data space. Use --api-version auto or 68.0 and the default data space, then rerun.',
  NATIVE_GRAPH_RETRIEVE_BLOCKED:
    'The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder (use --overwrite to replace a changed file), then rerun.',
  PARTIAL_DATA_GRAPH_OUTPUT:
    'The graph file was written, but the final check of it failed, so it may not match the org. Inspect the .native-dataGraph.json file and retrieve again with --overwrite.',
  UNSUPPORTED_DATA_GRAPH_CONFIGURATION:
    'The data graph definition or the answer from the org has a shape the plugin cannot check. Retrieve the graph again to get a supported file, or simplify the definition, then rerun.',
};
