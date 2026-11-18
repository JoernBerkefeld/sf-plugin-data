/** CLI hints for Data stream error codes. Long-form pages: docs/errors/data-stream/<CODE>.md */
export const hints: Readonly<Record<string, string>> = {
  AMBIGUOUS_STREAM_BINDING:
    'Several data streams on the connection read the same event, or a listed stream belongs to another connection. Keep one stream per event in Salesforce, then rerun.',
  AMBIGUOUS_STREAM_CONNECTION:
    'The Ingestion API connection could not be identified exactly once in the org. Check that spec.connectionName names one existing connection, then rerun.',
  AMBIGUOUS_STREAM_EVENT:
    'The stream could not be tied to exactly one event of its connection: the connection has no event, names one twice, or several events fit the stream. Retrieve wrote the stream as-is.',
  DATA_STREAM_DELETE_UNCONFIRMED:
    'The stream delete stopped on an unexpected error. If the result says mutation unknown, inspect the stream and its DLO in the org before you run the delete again.',
  DATA_STREAM_DLO_COLLISION:
    'A DLO file in the selection names the landing DLO of a data stream this deploy would create. The new stream creates and owns that DLO: remove the DLO file from the selection, then rerun.',
  DATA_STREAM_REQUEST_UNCONFIRMED:
    'The stream deploy stopped on an unexpected error. If the result says mutation unknown, inspect the stream in the org before you deploy again.',
  DATA_STREAM_RETRIEVE_FAILED:
    'The stream retrieve stopped on an unexpected error. Check the target org, your access and the network, then rerun the retrieve.',
  EMPTY_STREAM_PATCH:
    'The plugin tried to build a stream update with no mapping to add. Nothing was sent; rerun the deploy, and report it if it happens again.',
  INCOMPLETE_CONNECTION_LIST:
    "The list of Ingestion API connections was incomplete or had an unexpected shape. Check the org's connections; the plugin supports fewer than 200 of them.",
  INCOMPLETE_STREAM_DEPENDENCIES:
    "Salesforce's dependency list for the stream or its DLO was incomplete or had an unexpected shape. Rerun the delete; if the result says mutation unknown, inspect the org first.",
  INCOMPLETE_STREAM_LIST:
    "The connection's data stream list could not be read completely, for example because pages repeated or totals changed. Rerun the command; avoid changing streams while it runs.",
  INVALID_STREAM_BINDING:
    'The stream selection is outside the supported scope: data streams work only in the default data space with valid developer names. Remove --dataspace or use default.',
  INVALID_STREAM_CONNECTION:
    'The connection name used to list streams is not a valid developer name. Fix spec.connectionName so it starts with a letter and uses only letters, digits and underscores.',
  INVALID_STREAM_DELETE_SELECTION:
    'A data stream is selected for deletion as exact data-stream:ApiName, and --delete-dlo is not taken with --changed-since. Fix -m or the flags, then rerun the delete.',
  INVALID_STREAM_DELETE_SURVIVOR:
    'A DLO that should stay after the stream delete could not be checked. This is an internal guard; rerun the delete and report it if it happens again.',
  INVALID_STREAM_DLO:
    "The stream's linked DLO could not be read as exactly one matching DLO in the default data space. Check the DLO in the org, then rerun.",
  INVALID_STREAM_DOCUMENT:
    'A data stream document does not have the expected JSON structure. Retrieve the stream again, or compare the local file with a freshly retrieved one.',
  INVALID_STREAM_LABEL:
    'The landing DLO label in spec.newDlo.label is longer than 40 characters. Shorten it to 40 characters or fewer.',
  INVALID_STREAM_MAPPING:
    'An entry in spec.additiveFieldMappings or spec.formulaMappings is not valid. Write target names without __c, and use each target only once.',
  INVALID_STREAM_NAME:
    'A stream, connection, event, DLO or field name is not a valid developer name. Use a letter first, then only letters, digits and underscores; DLO names end in __dll.',
  INVALID_STREAM_OBSERVED:
    'The read-only observed section of the stream file is malformed or has duplicate entries. Do not edit observed; retrieve the stream again to refresh it.',
  INVALID_STREAM_ORG:
    'The target org alias or username is empty or not valid for the stream requests. Pass a valid alias or username with -o, then rerun.',
  INVALID_STREAM_PAGE:
    "A page of the connection's data stream list had an unexpected shape or page link. Rerun the command; report it if it keeps happening.",
  INVALID_STREAM_PRIMARY_KEY:
    'The primary key does not match: it must be one source field of the event, and the only key field of the DLO. Check spec.newDlo.primaryKey against the org.',
  INVALID_STREAM_READ:
    'Salesforce returned a stream, connection or DLO answer that is not a JSON object where one was expected. Rerun the command; report it if it keeps happening.',
  INVALID_STREAM_RESPONSE:
    'Salesforce accepted the stream create or update but its answer was not a JSON object. The write may have happened; inspect the stream in the org before you deploy again.',
  INVALID_STREAM_SCHEMA:
    "The connection's event does not match the stream: no event of that name, unsupported availability, or fields without a type or label, or named twice. Check spec.event and the schema.",
  INVALID_STREAM_TARGET_ID:
    'The stream record ID or delete option for an update or delete request was not valid. Nothing was sent; rerun the command and report it if it happens again.',
  PARTIAL_STREAM_OUTPUT:
    'The stream file was written, but the final check of its contents failed. Open data360/data-stream/<ApiName>.data-stream-meta.json, then retrieve again with --overwrite.',
  STREAM_BINDING_DRIFT:
    'The stream, its event or its connection changed between two reads, or reads disagreed. Wait until nobody changes the stream, then rerun; inspect the org first if mutation is unknown.',
  STREAM_CHANGE_NOT_APPLIED:
    'Salesforce accepted the stream write, but the stream still differs from the file in the named parts. Retrieve the stream to see what it holds; change the rest in Salesforce.',
  STREAM_CONNECTION_MISMATCH:
    "The stream's Ingestion API connection was found but is not connected or its details differ. Check the connection's status in the org, then rerun.",
  STREAM_CREATE_IDENTITY_UNCONFIRMED:
    "The stream create was sent, but the new stream could not be found on the connection with the returned name and ID. Inspect the connection's streams before you deploy again.",
  STREAM_CREATE_PERSISTENCE_UNCONFIRMED:
    'The new stream was found, but its DLO label, primary key or default mappings differ from the request. Inspect the stream in the org before you deploy again.',
  STREAM_CREATE_SETTLEMENT_UNCONFIRMED:
    'The stream was created but did not become ACTIVE within 15 minutes, or reached another status. Check the stream and its DLO in the org before you deploy again.',
  STREAM_CREATE_UNCONFIRMED:
    "Salesforce accepted the stream create but its answer lacked a valid stream name or record ID. A stream may exist; inspect the connection's streams before you deploy again.",
  STREAM_DATASPACE_COLLISION:
    'A local stream file with this name already exists for a different data space. Move or rename that file, then rerun the retrieve.',
  STREAM_DELETE_DEPENDENCIES_BLOCKED:
    'Something still depends on the stream or its DLO. Remove those dependencies, such as mappings or segments, then rerun the delete; inspect the org first if mutation is unknown.',
  STREAM_DELETE_DLO_REQUIRES_STREAM_SELECTION:
    '--delete-dlo only applies to data stream deletion. Select data-stream:ApiName members, or remove --delete-dlo to delete other components.',
  STREAM_DELETE_GUARD_DRIFT:
    'The stream, its connection or source fields changed during the delete checks or after the request. Inspect the stream in the org, then rerun the delete with --preview.',
  STREAM_DELETE_INPUT_DRIFT:
    'The delete options changed while the command ran. Nothing more was sent; rerun the delete with the options you want.',
  STREAM_DELETE_PARENT_DRIFT:
    'The stream was deleted, but its kept DLO changed or could not be read the same way. Check the DLO in the org before anything else.',
  STREAM_DELETE_SETTLEMENT_UNCONFIRMED:
    'The stream delete was sent, but its absence was not confirmed within 15 minutes. Check the stream and its DLO in the org before you run the delete again.',
  STREAM_DELETE_SURVIVOR_DRIFT:
    'A DLO that should stay unchanged by the stream delete changed. This is an internal guard; check that DLO in the org before anything else.',
  STREAM_DELETE_UNCONFIRMED:
    'Salesforce answered the stream DELETE without the expected empty success. The stream may be deleted; check it in the org before you run the delete again.',
  STREAM_DLO_DRIFT:
    "The stream's DLO fields or identity differ from what the stream reports. Wait until the DLO is not being changed, then rerun; inspect the org first if mutation is unknown.",
  STREAM_EXISTING_BINDING_REQUIRES_UPDATE:
    'A stream already exists for this connection and event, so it cannot be created. Retrieve it, edit the retrieved file, then deploy again.',
  STREAM_FILENAME_COLLISION:
    'The output folder has a file whose name differs from the stream file only by case or trailing dots or spaces, or the existing file holds another stream. Rename or move it.',
  STREAM_HTTP_ERROR:
    'Salesforce answered a stream create, update or delete with an error status. The change may still have happened; read the HTTP status, then inspect the org before you retry.',
  STREAM_LABEL_READ_FAILED:
    'The Metadata API read of the stream definition before its label update failed, so the update was not sent. Nothing was changed; rerun the deploy.',
  STREAM_LABEL_UPDATE_REJECTED:
    'Salesforce refused the Metadata API update of the stream label (DataStreamDefinition); the label was not changed. Read the message, correct the label in the file, then rerun.',
  STREAM_NOT_READY:
    'The stream or its DLO is not ACTIVE, for example still processing. Wait until both show ACTIVE in the org, then rerun.',
  STREAM_PROPOSED_DLO_EXISTS:
    'A DLO with the name in spec.newDlo.name exists. Choose another name, or delete the old DLO first if it is no longer needed.',
  STREAM_REQUEST_UNCONFIRMED:
    'A stream request did not return a readable HTTP status. For a create, update or delete, the change may have happened; inspect the org, then rerun.',
  STREAM_SNAPSHOT_PENDING:
    'The stream or its DLO switched between ACTIVE and PROCESSING between two reads. Wait until processing is finished, then rerun.',
  STREAM_SOURCE_DRIFT:
    "The stream's source fields differ from the fields of its connection event. Check the event schema in the org; the stream may need to be refreshed in Salesforce.",
  STREAM_TARGET_MISMATCH:
    'The stream with this name is not the stream found on the connection. Check spec.connectionName and the stream name, then retrieve the stream again.',
  STREAM_UPDATE_PRESERVATION_FAILED:
    'After the stream update, settings, mappings or DLO fields outside the requested additions changed. Inspect the stream and its DLO in the org before anything else.',
  STREAM_UPDATE_SETTLEMENT_UNCONFIRMED:
    'The stream update was sent, but the new mappings and ACTIVE status were not confirmed within 15 minutes. Check the stream in the org before you deploy again.',
  STREAM_UPDATE_TARGET_ABSENT:
    'The stream to update was no longer found on the connection. Check whether it was deleted, then rerun the deploy with --preview.',
  UNSUPPORTED_STREAM_CONNECTOR:
    'The stream GET names no connector type, or the Ingestion API connector with another stream type, which fits no stream file. Retrieve wrote it as-is; manage it in Salesforce.',
  UNSUPPORTED_STREAM_DATASPACE:
    'Data streams are supported only in the default data space: deploy refuses another identity.dataSpace, and retrieve does not write a stream whose DLO is in another space.',
  UNSUPPORTED_STREAM_MAPPING_SOURCE:
    'A sourceFieldLabel in spec.additiveFieldMappings matches no field of the event, or several. Salesforce would store such a mapping unchecked and it would carry no data. Use the exact label of one source field.',
  UNSUPPORTED_STREAM_PROJECTION:
    'The stream has a mapping the file cannot represent: from a field the event lacks or from a label several event fields share, onto a field the DLO lacks, or with both source and formula. Manage it in Salesforce.',
  UNSUPPORTED_STREAM_READ:
    'The Ingestion API stream read is outside what the stream file can hold: another stream type, no refresh mode, another data space, or missing names or lists. Manage this stream in Salesforce.',
  UNSUPPORTED_STREAM_SETTINGS_CHANGE:
    'The file changes what no stream update changes: the refresh mode, DLO label, category, event time field or primary key, or a plain CRM field mapping. Use the values from a freshly retrieved file.',
  UNSUPPORTED_STREAM_SPEC:
    'The Ingestion API stream file uses a value outside its shape. Use schemaVersion 1, IngestApi and INGEST_API; a stream of another connector keeps its connector in spec.connectorInfo.',
};
