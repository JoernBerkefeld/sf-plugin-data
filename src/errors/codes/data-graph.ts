/** CLI hints for Data graph error codes. Long-form pages: docs/errors/data-graph/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  DATA_GRAPH_CHANGE_NOT_APPLIED:
    'The graph read back after an accepted update has another join than the file (a newly added related object or a concurrent edit). Retrieve the graph; to change a join, delete the graph and create it again.',
  DATA_GRAPH_CREATE_UNCONFIRMED:
    'The graph create request was sent, but the graph could not be confirmed in time. It may exist: retrieve it or rerun the same deploy before changing anything.',
  DATA_GRAPH_DATASPACE_MISMATCH:
    "The data graph file's c__dataSpace, or the graph of that name in the org, is in another data space than the run. Graph names are unique in the org; rerun with the --dataspace the message names, or correct c__dataSpace.",
  DATA_GRAPH_DATASPACE_UNREADABLE:
    'The org answered the read of the data graph without a usable data space (dataspaceName), so the plugin cannot tell where the graph is and wrote or changed nothing. Rerun; if it repeats, check the graph in Data Cloud.',
  DATA_GRAPH_DEPENDENCY_OTHER_DATASPACE:
    "The root DMO of the graph is in another data space than the graph. Name the DMO of the graph's own data space (a standard DMO copy outside default is <prefix>_<Name>), then rerun.",
  DATA_GRAPH_DRAFT:
    'The data graph is a draft that was never built, so it was retrieved as-is. A draft cannot be deployed or edited through the API; build or edit it in Salesforce. A delete removes it.',
  DATA_GRAPH_IDENTITY_MISMATCH:
    'The org answered the read of a data graph with a different graph name than the one selected. Check the exact name, including case, in --metadata data-graph:<Name> and in the file, then rerun.',
  DATA_GRAPH_JOIN_CHANGE:
    'The file changes the join of a related object the graph already has. Salesforce accepts such a change but keeps the old join, so the plugin does not send it. Keep the join of the org, or delete the graph and create it again.',
  DATA_GRAPH_OWNER:
    'The graph root is a unified DMO created by the named identity resolution ruleset, which is published. No action is needed.',
  DATA_GRAPH_OWNER_NOT_FOUND:
    'The graph root is a unified DMO, but no identity resolution ruleset in the target creates it. Deploy the ruleset that produces it first, then preview the graph again.',
  DATA_GRAPH_OWNER_NOT_PUBLISHED:
    'The identity resolution ruleset that creates the graph root is not published yet. Wait until it is PUBLISHED (rerun its deploy to check), then preview the graph again.',
  DATA_GRAPH_PENDING:
    'A data graph of that name is still being built, or was just deleted and is still listed, so the deploy cannot write it now. Wait a few minutes, then rerun the same deploy.',
  DATA_GRAPH_PREFIX_MISMATCH:
    "A data graph name does not match its data space's prefix (ds2_ in dataspace2; no other space's prefix in default). A new graph is refused, an existing one only warned about.",
  DATA_GRAPH_ROOT_NOT_FOUND:
    'The root DMO of the graph does not exist in the target org. Deploy that DMO, or the identity resolution ruleset that creates it, then preview the graph again.',
  INVALID_NATIVE_DATA_GRAPH_NAME:
    'The data graph name is not a valid API name. Use a name that starts with a letter and has only letters, digits and underscores, at most 200 characters.',
  INVALID_NATIVE_DATA_GRAPH_SCOPE:
    'Data graphs work only with API version 68.0. Use --api-version auto or 68.0, then rerun.',
  NATIVE_GRAPH_RETRIEVE_BLOCKED:
    'The data graph could not be retrieved or written to disk. Check the graph name, your org access and the output folder, then rerun.',
  PARTIAL_DATA_GRAPH_OUTPUT:
    'The graph file was written, but the final check of it failed, so it may not match the org. Inspect the .native-dataGraph.json file and retrieve again.',
  UNSUPPORTED_DATA_GRAPH_CONFIGURATION:
    'The data graph definition or the answer from the org has a shape the plugin cannot check. Retrieve the graph again to get a supported file, or simplify the definition, then rerun.',
};
