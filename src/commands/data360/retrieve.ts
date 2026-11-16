import { DataTransformError, dataTransformName } from '../../artifacts/data-transform-document.js';
import { writeDataTransformDocument } from '../../artifacts/write-data-transform.js';
import { retrieveDataTransform } from '../../services/retrieve-data-transform.js';
import { createDataTransformClient } from '../../transport/data-transform-rest.js';
import { nativeDataGraphReadContext } from '../../services/native-data-graph-context.js';
import {
  getConnectDiagnostic,
  retainConnectDiagnostic,
} from '../../transport/connect-diagnostic.js';
import { retrieveNativeDataGraph } from '../../services/command-native-data-graph.js';
import { operationDiagnostic } from '../../services/operation-diagnostic.js';
import { annotateDiagnostics, formatDiagnostic } from '../../errors/registry.js';
import { dataStreamApiVersion, nativeApiVersion } from '../../transport/api-version.js';
import { DataStreamError } from '../../artifacts/data-stream-document.js';
import { writeDataStreamDocument } from '../../artifacts/write-data-stream.js';
import { retrieveDataStreamDocument } from '../../services/native-crm-data-stream.js';
import {
  createDataStreamClient,
  createDataStreamReferenceReader,
} from '../../transport/data-stream-rest.js';
import {
  retrieveNativeDataStream,
  sortedStreamMappings,
} from '../../services/native-data-stream.js';
import { listNativeNames, listNativeMappingNames } from '../../services/select-native-retrieve.js';
import { retrieveLeanNativeMapping } from '../../services/native-mapping.js';
import type { MappingDependencies } from '../../services/native-mapping.js';
import { createMappingClient, createMappingInventoryReader } from '../../transport/mapping-rest.js';
import { writeNativeMappingDocument } from '../../artifacts/write-native-mapping.js';
import { NativeMappingError, nativeMappingName } from '../../artifacts/native-mapping-document.js';
import { nativeDmoName, NativeDmoError } from '../../artifacts/native-dmo-document.js';
import { retrieveNativeDmo } from '../../services/native-dmo.js';
import { createDmoClient } from '../../transport/dmo-rest.js';
import { writeNativeDmoDocument } from '../../artifacts/write-native-dmo.js';
import { dloName, DloError } from '../../artifacts/dlo-document.js';
import { retrieveNativeDlo } from '../../services/native-dlo.js';
import { createDloClient } from '../../transport/dlo-rest.js';
import { writeDloDocument } from '../../artifacts/write-dlo.js';
import {
  NativeRelationshipError,
  relationshipDmoName,
} from '../../artifacts/native-relationship-document.js';
import { writeNativeRelationshipDocument } from '../../artifacts/write-native-relationship.js';
import {
  labelRelationships,
  readLabels,
  relationshipLabelNames,
  retrieveUnlabelledRelationships,
} from '../../services/native-relationship.js';
import {
  createRelationshipClient,
  relationshipReadBatch,
} from '../../transport/relationship-rest.js';
import { openBoundSsot } from '../../transport/bound-ssot.js';
import type { BoundSsot } from '../../transport/bound-ssot.js';
import { withCheckedDirectories } from '../../transport/project-metadata.js';
import { readInOrder } from '../../services/bounded-reads.js';
import { MappingDefinitionError } from '../../artifacts/write-mapping-definition.js';
import { mappingName } from '../../artifacts/mapping-document.js';
import { writeDataGraphDocument } from '../../artifacts/write-data-graph.js';
import { DataGraphError } from '../../artifacts/data-graph-document.js';
import path from 'node:path';
import {
  calculatedInsightName,
  CalculatedInsightError,
} from '../../artifacts/native-calculated-insight-document.js';
import type { NativeCalculatedInsight } from '../../artifacts/native-calculated-insight-document.js';
import {
  listCalculatedInsightNames,
  retrieveNativeCalculatedInsight,
} from '../../services/native-calculated-insight.js';
import { createCalculatedInsightClient } from '../../transport/calculated-insight-rest.js';
import { writeNativeCalculatedInsightDocument } from '../../artifacts/write-native-calculated-insight.js';
import { Flags, SfCommand } from '@salesforce/sf-plugins-core';
import { AuthInfo, ConfigAggregator, Connection, Org, StateAggregator } from '@salesforce/core';
import { operationApiVersion, resolveApiVersion } from '../../transport/api-version.js';
import {
  IdentityResolutionError,
  identityResolutionName,
  validateIdentityResolutionDocument,
} from '../../artifacts/identity-resolution-document.js';
import {
  listIdentityResolutionNames,
  retrieveIdentityResolution,
} from '../../services/retrieve-identity-resolution.js';
import { writeIdentityResolutionDocument } from '../../artifacts/write-identity-resolution.js';
import type { IdentityResolutionDocument } from '../../artifacts/identity-resolution-document.js';
import { ConnectClient, ConnectError } from '../../transport/connect-client.js';
import { plugin as packageMetadata } from '../../plugin.js';
import { SegmentError, segmentName } from '../../artifacts/segment-document.js';
import { writeSegmentDocument } from '../../artifacts/write-segment.js';
import { listSegmentNames, retrieveSegment } from '../../services/retrieve-segment.js';
import {
  listDataGraphNames,
  listDataStreamNames,
  listDataTransformNames,
} from '../../services/retrieve-inventory.js';
import {
  acquireRetrieveSelection,
  RetrieveSelectionError,
} from '../../services/acquire-retrieve-selection.js';
import { DependencySelectionError } from '../../artifacts/dependency-selection.js';
import {
  carriedNativeResponse,
  carryNativeResponse,
  createVerbatimDocument,
  isVerbatimDocument,
  nativeReadRecorder,
  recordNativeReads,
  verbatimFamily,
  verbatimReason,
} from '../../artifacts/verbatim-document.js';
import type { VerbatimDocument, VerbatimKind } from '../../artifacts/verbatim-document.js';
import { localFilePresent } from '../../services/local-file-removal.js';

export type RetrieveEnvelope = {
  contract: 'sf-data360-retrieve';
  contractVersion: '1.0.0';
  status: 'success' | 'blocked' | 'failed';
  metadata: {
    operation: 'retrieve';
    plugin: { name: string; version: string };
    apiVersion: string;
    soapApiVersion?: string;
  };
  diagnostics: {
    warnings: string[];
    errors: Array<{
      code: string;
      message: string;
      retryable: false;
      identity?: { dataSpace: string; apiName: string };
      family?: RetrieveFamily;
    }>;
  };
  provenance: {
    producer: string;
    sourceOrgId: string | null;
    pluginVersion: string;
    command: string;
    generatedAt: string;
  };
  result: {
    scope: { dataSpace: string; outputDir: string };
    selection: string[];
    items: Array<{
      identity: { dataSpace: string; apiName: string };
      operation: 'retrieve';
      outcome: 'retrieved' | 'unchanged';
      path: string;
      companionPath?: string;
      /** Segment: the SQL file of each model, in model order. */
      codePaths?: string[];
      paths?: string[];
      family?:
        | 'segment'
        | 'identity-resolution'
        | 'calculated-insight'
        | 'data-graph'
        | 'data-stream'
        | 'data-transform'
        | 'dlo'
        | 'relationship'
        | 'mapping';
      routes?: Array<{
        operation: string;
        apiVersion: string;
        transport: 'native' | 'metadata';
      }>;
      /** Written as Salesforce returned it: the plugin cannot represent it (reason: error code). */
      verbatim?: { reason: string };
    }>;
  };
};
type RetrieveItem = RetrieveEnvelope['result']['items'][number];
type RetrieveRoute = NonNullable<RetrieveItem['routes']>[number];
/** One family writer: a normal or a verbatim document to its file(s). */
type DocumentWriter = (
  document: unknown,
  root: string,
  overwrite: boolean,
) => Promise<{ path: string; outcome: 'retrieved' | 'unchanged' }>;
/** Where a verbatim fallback is written and reported. */
type VerbatimTarget = {
  kind: VerbatimKind;
  identity: { dataSpace: string; apiName: string };
  routes: RetrieveRoute[];
  root: string;
  overwrite: boolean;
  warnings: string[];
  push: (item: RetrieveItem) => void;
};
/** The raw GET response remembered for a name, if it was read. */
type NativeOf = (name: string) => { native: unknown } | undefined;
/** One run's DLO and DMO listing entries by name, filled by listNativeNames. */
type ListedEntries = { dlo: Map<string, unknown>; dmo: Map<string, unknown> };
// Before an item's client exists nothing was read.
const noReads = new Map<string, { native: unknown }>();
const nothingRead: NativeOf = (name) => noReads.get(name);

/** Name the actual reason a calculated insight was not exported. */
const calculatedInsightRetrieveMessages: Record<string, string> = {
  CI_NOT_FOUND: 'The calculated insight was not found in the target org; no files were written.',
  CI_RUNTIME_UNKNOWN: 'The calculated insight could not be read; no files were written.',
  CI_IDENTITY_CHANGED:
    'The calculated insight the org returned has a different API name or data space; no files were written.',
};

const retrieveFamilies = [
  'dlo',
  'dmo',
  'mapping',
  'relationship',
  'segment',
  'calculated-insight',
  'identity-resolution',
  'data-stream',
  'data-transform',
  'data-graph',
] as const;
/** Family named on a diagnostic. */
export type RetrieveFamily = (typeof retrieveFamilies)[number];
type RetrieveDiagnostic = RetrieveEnvelope['diagnostics']['errors'][number];
const nativeFamilies = ['dlo', 'dmo', 'mapping'] as const;
// Relationship reads in flight at once during one retrieve (bounded; see readInOrder).
const relationshipReads = 6;
/** Selector groups, in run order; `rest` holds every family without its own group. */
const selectorGroups = ['rest', 'data-stream', 'data-transform', 'data-graph'] as const;
type RetrieveFlags = {
  'target-org'?: string;
  'api-version': string;
  dataspace?: string;
  metadata?: string[];
  'output-dir'?: string;
  overwrite: boolean;
};
/** Shared state of one retrieve command that each selector group reads and appends to. */
type RetrieveRun = {
  flags: RetrieveFlags;
  envelope: RetrieveEnvelope;
  outputTypes: Set<string>;
  errorTypes: Map<RetrieveDiagnostic, string>;
  requestScope: string | undefined;
  effectiveScope: string;
  outputDirectory: string;
};
/** What one selector group's read returns; `code` is a group-level refusal without identity. */
type GroupOutcome = {
  status: RetrieveEnvelope['status'];
  selection: string[];
  code?: string;
  error?: unknown;
  family?: RetrieveFamily;
};
/** A selector group refused before org access, or its validated read. */
type GroupPlan =
  | { refusal: string; family: RetrieveFamily }
  | { family: RetrieveFamily; run: () => Promise<GroupOutcome> };

/**
 * The family a selector names; selectors of no known family are DMO selectors.
 * @param {string | undefined} selector Selector such as `dmo:Name__dlm`.
 * @returns {RetrieveFamily} Its family.
 */
function selectorFamily(selector: string | undefined): RetrieveFamily {
  const prefix = (selector ?? 'dmo').split(':')[0];
  return retrieveFamilies.find((family) => family === prefix) ?? 'dmo';
}

/**
 * Whether a selector belongs to a group: the bare group name or `group:Name`.
 * @param {string} group Group name.
 * @param {string} value Selector.
 * @returns {boolean} Membership.
 */
function inGroup(group: string, value: string): boolean {
  return value === group || value.startsWith(`${group}:`);
}

/**
 * Split the selection into groups in run order; groups without selectors are left out, and an
 * empty selection is the rest group alone (every native family).
 * @param {string[]} selectors Every -m selector.
 * @returns {Array<[string, string[]]>} Non-empty groups in run order.
 */
function groupSelectors(selectors: string[]): Array<[(typeof selectorGroups)[number], string[]]> {
  return selectorGroups
    .map((group): [(typeof selectorGroups)[number], string[]] => [
      group,
      group === 'rest'
        ? selectors.filter(
            (value) => !selectorGroups.some((other) => other !== 'rest' && inGroup(other, value)),
          )
        : selectors.filter((value) => inGroup(group, value)),
    ])
    .filter(
      ([group, members]) => members.length > 0 || (group === 'rest' && selectors.length === 0),
    );
}

/**
 * Status of one group from the diagnostics it added.
 * @param {RetrieveEnvelope} envelope Shared envelope.
 * @param {number} before Diagnostics count when the group started.
 * @param {boolean} failed Whether a failure was not local to one output.
 * @returns {'success' | 'blocked' | 'failed'} Group status.
 */
function groupStatus(
  envelope: RetrieveEnvelope,
  before: number,
  failed: boolean,
): RetrieveEnvelope['status'] {
  return envelope.diagnostics.errors.length === before ? 'success' : failed ? 'failed' : 'blocked';
}

/**
 * Message of a diagnostic without a more specific explanation.
 * @param {unknown} error Cause, whose safe Salesforce detail is kept.
 * @returns {string} Payload-free message.
 */
function retrievalMessage(error: unknown): string {
  const fallback =
    'Retrieval did not complete. Check selection, authenticated org, service capability and output path.';
  return error === undefined ? fallback : operationDiagnostic(error, fallback);
}

/**
 * Name the code of the error behind a family-level diagnostic, so the cause stays visible.
 * @param {string} message Diagnostic message.
 * @param {unknown} error Cause.
 * @returns {string} The message, followed by `Cause: <CODE>.` when the cause has a code.
 */
function withInnerCode(message: string, error: unknown): string {
  const code = (error as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/u.test(code)
    ? `${message} Cause: ${code}.`
    : message;
}

/**
 * Code of a native inventory that could not be read.
 * @param {unknown} error Cause.
 * @returns {string} Its mapping code, or NATIVE_INVENTORY_FAILED.
 */
function inventoryCode(error: unknown): string {
  return error instanceof NativeMappingError ? error.code : 'NATIVE_INVENTORY_FAILED';
}

/** Retrieve selected DMO configuration through existing service-owned capability checks. */
/**
 * The raw stream GET a verbatim file keeps, with its mappings in a stable order.
 * @param {unknown} response Stream GET body.
 * @returns {{ native: unknown }} Response with sorted mappings.
 */
function verbatimStreamNative(response: unknown): { native: unknown } {
  if (!response || typeof response !== 'object' || Array.isArray(response))
    return { native: response };
  const body = response as Record<string, unknown>;
  return Array.isArray(body.mappings)
    ? { native: { ...body, mappings: sortedStreamMappings(body.mappings) } }
    : { native: response };
}

export default class Retrieve extends SfCommand<RetrieveEnvelope> {
  public static readonly aliases = ['datacloud:retrieve', 'd360:retrieve', 'dc:retrieve'];
  public static readonly summary =
    'Retrieve any mix of Data360 DLOs, DMOs, mappings, relationships, data streams, data transforms, data graphs, Segments, calculated insights and identity resolution configuration.';
  public static readonly description =
    'Any mix of selectors is retrieved in one run with one result: every selector is checked before the org is read, and a refused selector blocks the whole run (with several families selected, the refusal names its family). The families are then read one after another (DLO, DMO, mapping, relationship, Segment, calculated insight and identity resolution first, then data streams, data transforms and data graphs), each with its own API version and data space rules; one family failing does not stop the others. Exact -m data-transform:Name retrieves a custom transform without package namespace at API68/default only into data360/dataTransforms/<Name>.dataTransform.json: its create/update input as Salesforce returns it (definition or definitions, fullRunFrequency, write mode and the rest as read), without the schedule and without server-owned output object fields; the schedule is not retrieved or deployed. A system-generated or packaged transform is written as-is (verbatim), and deploy refuses that file. Bare -m data-transform retrieves every transform the API lists (unless it names another data space), each through the same path; one failing transform never blocks the others. Exact -m data-stream:ApiName retrieves the qualified Ingestion API subset as portable JSON using native API68 reads, in default space only; a Salesforce CRM stream (connector SalesforceDotCom) is written as its GET without server-owned keys and the system fields and mappings Salesforce adds, formulas decoded. Bare -m data-stream retrieves every stream the API lists (unless its DLO names only other data spaces), each through the same path. Native DLO, DMO and mapping retrieval writes canonical JSON under data360/<type>, retaining definition fields without source record IDs. Default/auto uses API68; explicit numeric versions >=61 are preserved, and <=60 is rejected before calls. Omit selectors for all three native families, use -m dlo, -m dmo or -m mapping for complete type inventory, or repeat type:ApiName for exact selections. Omitted selectors and -m dlo (also beside other families) retrieve every DLO the Data 360 API lists in the data space, connector- and stream-created ones included; a DLO whose read or file fails gets its own diagnostic and the others are still retrieved. Mapping JSON uses only native APIs, never Metadata fallback. DMOs retrieved beside other families use the same native JSON at the native version. Prerequisites are checked, never pulled in; select every component to retrieve explicitly. Every DMO selection uses this native route, and --api-version latest is not accepted. Exact -m relationship:Dmo__dlm writes every relationship whose source is that DMO as native JSON under data360/relationship/<Name>.relationship-meta.json; bare -m relationship does so for every DMO the API lists, one DMO after another. Repeat -m dmo:ApiName, -m segment:ApiName, -m calculated-insight:ApiName__cio, -m data-graph:ApiName or -m identity-resolution:ExactObjectApiName for exact selection. Graph retrieval uses native API68 (auto or explicit 68.0; other versions are rejected) and writes *.native-dataGraph.json authored intent without generated identities, default space only; repeat data-graph:ApiName for several graphs, read one after another. Bare -m data-graph retrieves every default-space graph the API lists. Calculated insights use the API68 GET only (auto or 68.0, default space): -m calculated-insight:ApiName__cio retrieves that insight and bare -m calculated-insight every insight the API lists, whatever its status, schedule or SQL; each is written as data360/calculatedInsights/<ApiName>.calculatedInsight-meta.json (the GET body as returned, without status, run history, source-CI links, creation type, sub type and the dimensions and measures Salesforce derives from the SQL) plus its SQL as plain text in <ApiName>.calculatedInsight-meta.sql. IR uses native API68 owner reads in default space; auto and explicit numeric68 are supported, while numeric67 is rejected. -m identity-resolution:ExactObjectApiName retrieves that ruleset and bare -m identity-resolution every default-space ruleset the API lists. Auto selects fixed qualified routes, never probes or upgrades an explicit numeric pin. Segment uses auto or 68.0 in default space (other versions are refused): -m segment:ApiName retrieves that segment and bare -m segment every default-space segment the API lists. A SQL (DBT) segment is written as one portable data360/segments/<Name>.segment.json with its DBT model names, and the SQL of each model as Salesforce returns it in <Name>.segment.<model>.sql beside it; a UI segment (built in the segment canvas) is written as a normal <Name>.segment.json with its criteria as JSON. A segment with a refresh schedule other than no refresh, parameters, exclusion criteria or the Waterfall, Real-Time or Lookalike type, and a SQL segment with a lookback other than 90 days, is written as-is (verbatim) and deploy refuses that file. Use -m dmo or omit selectors for existing DMO inventory; omitted selectors do not include segments. Unsupported objects produce per-object diagnostics and a nonzero aggregate while successful files are retained. Differing files require --overwrite; identical bytes are unchanged. Retrieval never mutates the org.';
  public static readonly flags = {
    'target-org': Flags.string({
      char: 'o',
      summary: 'Authenticated org alias or username; defaults to the configured target org.',
    }),
    'api-version': Flags.orgApiVersion({
      default: 'auto',
      summary:
        'Native default/auto 68.0 or an explicit numeric pin (native minimum 61.0); other families keep their qualified versions.',
      parse: async (value, context, options) =>
        value === 'auto' ? value : Flags.orgApiVersion().parse(value, context, options),
    }),
    dataspace: Flags.string({
      aliases: ['data-space'],
      summary:
        'Optional native data space; --data-space is a compatibility alias. Other families require default.',
    }),
    metadata: Flags.string({
      char: 'm',
      multiple: true,
      multipleNonGreedy: true,
      summary:
        'Repeat to mix families in one run. Native dlo/dmo/mapping type or type:ApiName JSON selections; bare dlo is every DLO the API lists; omitted selects all native families. relationship:Dmo__dlm (relationships whose source is that DMO), data-stream:ApiName, data-transform:Name, data-graph:ApiName, segment:ApiName, identity-resolution:ExactObjectApiName and calculated-insight:ApiName__cio, or the bare family name for every one the API lists (bare relationship: those of every listed DMO).',
    }),
    'output-dir': Flags.directory({
      char: 'd',
      exists: false,
      summary: 'Project root for JSON; defaults to the current directory.',
    }),
    overwrite: Flags.boolean({
      char: 'x',
      default: false,
      summary: 'Permit replacing differing selected files.',
    }),
  };

  protected acquireDataTransform = retrieveDataTransform;
  protected createDataTransformClient = createDataTransformClient;
  protected writeDataTransform = writeDataTransformDocument;
  protected nativeGraphContext = nativeDataGraphReadContext;
  protected retrieveNativeGraph = retrieveNativeDataGraph;
  protected acquireDataStream = retrieveDataStreamDocument;
  protected writeDataStream = writeDataStreamDocument;
  protected createDataStreamClients = (
    connection: Connection,
    target: string,
    version: string,
  ): Parameters<typeof retrieveNativeDataStream>[1] => {
    const reader = new ConnectClient(connection, version);
    return {
      streams: createDataStreamClient(target, reader, version),
      ...createDataStreamReferenceReader(reader, version),
      dlo: {
        get: (name) => reader.get(`/services/data/v${version}/ssot/data-lake-objects/${name}`),
      },
    };
  };
  protected acquireNativeDmo = retrieveNativeDmo;
  protected createDmoClient = createDmoClient;
  protected writeNativeDmo = writeNativeDmoDocument;
  protected acquireDlo = retrieveNativeDlo;
  protected createDloClient = createDloClient;
  protected writeDlo = writeDloDocument;
  // Authored pairs only: the generated pairs are decided from fresh source DLO and target DMO reads.
  protected acquireNativeMapping = retrieveLeanNativeMapping;
  protected createMappingClient = createMappingClient;
  protected createMappingInventoryReader = createMappingInventoryReader;
  protected writeNativeMapping = writeNativeMappingDocument;
  // Native DLO/DMO/mapping reads share one bound sender per org and version on the run's own
  // authenticated Connection instead of one CLI process per read. Tests replace this seam.
  protected createSsotSender = openBoundSsot;
  private ssotSenders?: Map<string, BoundSsot>;
  /**
   * One shared bound sender per org and API version.
   * @param {string} target Target org alias or username.
   * @param {string} version Numeric API version.
   * @param {Connection} connection The run's authenticated Connection for that org.
   * @returns {BoundSsot} Shared sender.
   */
  protected ssotSender(target: string, version: string, connection: Connection): BoundSsot {
    const key = `${target}\n${version}`;
    // Tests build commands without field initializers, so both fields may be absent.
    this.ssotSenders ??= new Map();
    let sender = this.ssotSenders.get(key);
    if (!sender) {
      sender = (this.createSsotSender ?? openBoundSsot)(target, version, async () => connection);
      this.ssotSenders.set(key, sender);
    }
    return sender;
  }
  /**
   * Readers of a mapping's source DLO and target DMO; clients are created on the first read.
   * @param {string} target Target org alias or username.
   * @param {string} version Native API version.
   * @param {BoundSsot} sender Shared bound sender for the reads.
   * @param {ListedEntries} [listed] This run's DLO and DMO listing entries at the same version.
   * @returns {MappingDependencies} Lazy source and target readers.
   */
  protected mappingParents(
    target: string,
    version: string,
    sender: BoundSsot,
    listed?: ListedEntries,
  ): MappingDependencies {
    return {
      source: {
        get: async (name) =>
          (this.createDloClient ?? createDloClient)(target, version, sender, listed?.dlo).get(name),
      },
      target: {
        get: async (name) =>
          (this.createDmoClient ?? createDmoClient)(
            target,
            version,
            undefined,
            sender,
            listed?.dmo,
          ).get(name),
      },
    };
  }
  protected listNativeNames = listNativeNames;
  protected listNativeMappingNames = listNativeMappingNames;
  protected acquireRelationships = retrieveUnlabelledRelationships;
  /**
   * A relationship client on the run's shared bound sender: every DMO's reads go through one
   * in-process connection, never a CLI process. Tests replace this seam.
   * @param {Connection} connection The run's authenticated Connection.
   * @param {string} target Target org alias or username.
   * @param {string} version Native API version.
   * @param {string} [requestScope] Optional request scope.
   * @returns {ReturnType<typeof createRelationshipClient>} Relationship client.
   */
  protected createRelationshipClient(
    connection: Connection,
    target: string,
    version: string,
    requestScope?: string,
  ): ReturnType<typeof createRelationshipClient> {
    return createRelationshipClient(
      target,
      version,
      requestScope,
      this.ssotSender(target, version, connection),
    );
  }
  protected writeRelationship = writeNativeRelationshipDocument;
  protected writeDataGraph = writeDataGraphDocument;
  protected createCalculatedInsightClient = createCalculatedInsightClient;
  protected acquireCalculatedInsight = retrieveNativeCalculatedInsight;
  protected listCalculatedInsightNames = listCalculatedInsightNames;
  // Optional: tests built with Object.create skip class fields and fall back to the real listing.
  protected listSegmentNames?: typeof listSegmentNames;
  protected listIdentityResolutionNames?: typeof listIdentityResolutionNames;
  protected listDataStreamNames?: typeof listDataStreamNames;
  protected listDataTransformNames?: typeof listDataTransformNames;
  protected listDataGraphNames?: typeof listDataGraphNames;
  protected writeCalculatedInsight = writeNativeCalculatedInsightDocument;
  protected acquireIdentityResolution = retrieveIdentityResolution;
  protected writeIdentityResolution = writeIdentityResolutionDocument;
  protected acquireSegment = retrieveSegment;
  protected acquireSelection = acquireRetrieveSelection;
  protected writeSegment = writeSegmentDocument;
  protected resolveOrg = async (
    aliasOrUsername?: string,
  ): Promise<Pick<Org, 'getConnection' | 'getOrgId'>> => {
    const aggregator = await ConfigAggregator.create();
    const state = await StateAggregator.getInstance();
    const target = aliasOrUsername ?? aggregator.getPropertyValue<string>('target-org');
    const username = target ? state.aliases.resolveUsername(target) : undefined;
    const connection = await Connection.create({
      authInfo: await AuthInfo.create({ username }),
      connectionOptions: { version: '68.0' },
    });
    // Org.create also probes org traits using another unversioned connection; avoid it.
    return {
      getOrgId: () => connection.getAuthInfoFields().orgId!,
      getConnection: (version?: string) => {
        if (version) connection.setApiVersion(version);
        return connection;
      },
    };
  };
  /**
   * The writer of a document kind; every writer also writes a verbatim document of its kind.
   * @param {VerbatimKind} kind Document kind.
   * @returns {DocumentWriter} Family writer.
   */
  private documentWriter(kind: VerbatimKind): DocumentWriter {
    const writers: Record<VerbatimKind, DocumentWriter> = {
      dlo: this.writeDlo ?? writeDloDocument,
      dmo: this.writeNativeDmo ?? writeNativeDmoDocument,
      mapping: this.writeNativeMapping ?? writeNativeMappingDocument,
      relationship: this.writeRelationship ?? writeNativeRelationshipDocument,
      'data-stream': this.writeDataStream ?? writeDataStreamDocument,
      'data-transform': this.writeDataTransform ?? writeDataTransformDocument,
      'native-data-graph': this.writeDataGraph ?? writeDataGraphDocument,
      'calculated-insight': this.writeCalculatedInsight ?? writeNativeCalculatedInsightDocument,
      'identity-resolution': this.writeIdentityResolution ?? writeIdentityResolutionDocument,
      segment: this.writeSegment ?? writeSegmentDocument,
    };
    return writers[kind];
  }

  /**
   * Report a written verbatim document: a warning naming the reason (and a calculated insight's
   * SQL file left from an earlier retrieve), plus the item marker.
   * @param {VerbatimDocument} document Written verbatim document.
   * @param {string} file Its path.
   * @param {string[]} warnings Envelope warnings.
   * @returns {Promise<{verbatim: {reason: string}}>} Item marker.
   */
  private async noteVerbatim(
    document: VerbatimDocument,
    file: string,
    warnings: string[],
  ): Promise<{ verbatim: { reason: string } }> {
    let text = `${verbatimFamily(document.kind)}:${document.identity.apiName}: retrieved as-is (verbatim, reason ${document.verbatim.reason}) because the plugin cannot represent it. Deploy skips the file in a folder or Git range and refuses it when it is named.`;
    if (document.kind === 'calculated-insight') {
      const sql = file.replace(/\.json$/u, '.sql');
      if (sql !== file && (await localFilePresent(sql)))
        text += ` The SQL file ${sql} from an earlier retrieve was left in place; remove it when you no longer need it.`;
    }
    warnings.push(text);
    return { verbatim: { reason: document.verbatim.reason } };
  }

  /**
   * The verbatim document for a failed projection or validation, or undefined when the failure
   * stays an item failure (HTTP error, not found, identity/target mismatch, no response read).
   * @param {unknown} error Caught error.
   * @param {{native: unknown} | undefined} read Raw GET response of the item.
   * @param {VerbatimKind} kind Normal document kind.
   * @param {object} identity Normal identity.
   * @param {string} identity.dataSpace Data space.
   * @param {string} identity.apiName API name.
   * @returns {VerbatimDocument | undefined} Verbatim document.
   */
  private verbatimFor(
    error: unknown,
    read: { native: unknown } | undefined,
    kind: VerbatimKind,
    identity: { dataSpace: string; apiName: string },
  ): VerbatimDocument | undefined {
    const reason = verbatimReason(error);
    return reason === undefined || read === undefined
      ? undefined
      : createVerbatimDocument(kind, identity, reason, read.native);
  }

  /**
   * Catch-all of every family: an item whose projection or validation failed is written as
   * Salesforce returned it, at its normal path, with a warning; it is not an item failure.
   * @param {unknown} caught Caught error.
   * @param {{native: unknown} | undefined} read Raw GET response of the item.
   * @param {VerbatimTarget} target Kind, identity, routes, output and where to report.
   * @returns {Promise<unknown>} Undefined when written; otherwise the error to report (the
   * original one, or the verbatim write's own).
   */
  private async verbatimFallback(
    caught: unknown,
    read: { native: unknown } | undefined,
    target: VerbatimTarget,
  ): Promise<unknown> {
    const document = this.verbatimFor(caught, read, target.kind, target.identity);
    if (document === undefined) return caught;
    try {
      const receipt = await this.documentWriter(target.kind)(
        document,
        target.root,
        target.overwrite,
      );
      const family = verbatimFamily(target.kind);
      target.push({
        identity: { ...document.identity },
        operation: 'retrieve',
        ...(family === 'dmo' ? {} : { family: family as RetrieveItem['family'] }),
        routes: target.routes,
        ...receipt,
        ...(await this.noteVerbatim(document, receipt.path, target.warnings)),
      });
      return undefined;
    } catch (error) {
      return error;
    }
  }

  /**
   * Retrieve every relationship whose source is one of the DMOs, one file each. Each DMO's
   * inventory is read completely before its files are written; failures stay per DMO or file.
   * @param {string[]} dmoNames Exact sorted source DMOs.
   * @param {Connection} connection Command-owned connection for the bound reads.
   * @param {string} target Resolved username.
   * @param {string} version Native API version.
   * @param {string | undefined} requestScope Optional request scope.
   * @param {string} root Project root.
   * @param {boolean} overwrite Permit replacing differing files.
   * @returns {Promise<object>} Items, diagnostics and whether a failure was not local.
   */
  private async retrieveRelationshipFamily(
    dmoNames: string[],
    connection: Connection,
    target: string,
    version: string,
    requestScope: string | undefined,
    root: string,
    overwrite: boolean,
  ): Promise<{
    items: RetrieveEnvelope['result']['items'];
    errors: RetrieveEnvelope['diagnostics']['errors'];
    warnings: string[];
    failed: boolean;
  }> {
    const items: RetrieveEnvelope['result']['items'] = [];
    const errors: RetrieveEnvelope['diagnostics']['errors'] = [];
    const warnings: string[] = [];
    let failed = false;
    const diagnose = (error: unknown, apiName: string): void => {
      const code = error instanceof NativeRelationshipError ? error.code : 'NATIVE_RETRIEVE_FAILED';
      if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH'].includes(code)) failed = true;
      errors.push({
        code,
        message: operationDiagnostic(
          error,
          'Relationship retrieval did not complete for this item; the org was not changed.',
        ),
        retryable: false,
        identity: { dataSpace: requestScope ?? 'default', apiName },
        family: 'relationship',
      });
    };
    const client = this.createRelationshipClient(connection, target, version, requestScope);
    // Up to relationshipReads DMOs are listed at once; results, files and diagnostics still follow
    // the DMO order, one DMO after another.
    const reads = await Promise.all(
      readInOrder(dmoNames, relationshipReads, async (dmo) =>
        (this.acquireRelationships ?? retrieveUnlabelledRelationships)(
          dmo,
          client,
          requestScope,
          'retrieve',
        ),
      ),
    );
    // The labels of all DMOs are then read together, up to 10 names per Metadata API read: one
    // read per DMO exhausted the org's hourly Metadata API request limit on a full retrieve.
    const labels = new Map<string, string>();
    const labelFailures = new Map<string, unknown>();
    if (client.readDefinitions) {
      const names = reads.flatMap((read) =>
        'error' in read ? [] : relationshipLabelNames(read.value),
      );
      for (let start = 0; start < names.length; start += relationshipReadBatch) {
        const batch = names.slice(start, start + relationshipReadBatch);
        try {
          for (const [name, label] of await readLabels(batch, client)) labels.set(name, label);
        } catch (error) {
          for (const name of batch) labelFailures.set(name, error);
        }
      }
    }
    for (const [index, dmo] of dmoNames.entries()) {
      const read = reads[index];
      if ('error' in read) {
        diagnose(read.error, dmo);
        continue;
      }
      const failed = relationshipLabelNames(read.value).find((name) => labelFailures.has(name));
      if (failed !== undefined) {
        diagnose(labelFailures.get(failed), dmo);
        continue;
      }
      const documents = labelRelationships(read.value, labels);
      const routes: RetrieveRoute[] = [
        { operation: 'relationship.list', apiVersion: version, transport: 'native' },
      ];
      for (const document of documents)
        try {
          const receipt = await (this.writeRelationship ?? writeNativeRelationshipDocument)(
            document,
            root,
            overwrite,
          );
          items.push({
            identity: document.identity,
            operation: 'retrieve',
            family: 'relationship',
            routes,
            ...receipt,
            ...(isVerbatimDocument(document)
              ? await this.noteVerbatim(document, receipt.path, warnings)
              : {}),
          });
        } catch (error_) {
          const error = await this.verbatimFallback(error_, carriedNativeResponse(document), {
            kind: 'relationship',
            identity: document.identity,
            routes,
            root,
            overwrite,
            warnings,
            push: (item) => items.push(item),
          });
          if (error !== undefined) diagnose(error, document.identity.apiName);
        }
    }
    return { items, errors, warnings, failed };
  }

  /**
   * Report a family listing that could not be read; the family's named items are still read.
   * @param {RetrieveEnvelope} envelope Shared envelope.
   * @param {Map<RetrieveDiagnostic, string>} errorTypes Output type of each diagnostic.
   * @param {unknown} error The listing failure.
   * @param {RetrieveFamily} family Family whose listing failed.
   */
  private inventoryFailure(
    envelope: RetrieveEnvelope,
    errorTypes: Map<RetrieveDiagnostic, string>,
    error: unknown,
    family: RetrieveFamily,
  ): void {
    const diagnostic: RetrieveDiagnostic = {
      code: error instanceof ConnectError ? error.code : inventoryCode(error),
      message: retrievalMessage(error),
      retryable: false,
      family,
    };
    envelope.diagnostics.errors.push(diagnostic);
    errorTypes.set(diagnostic, family);
  }

  /**
   * Validate exact and bare data transform selectors, then read them one after another.
   * @param {string[]} selectors The data-transform group.
   * @param {RetrieveRun} context Shared command state.
   * @returns {GroupPlan} A refusal, or the group's read.
   */
  private prepareDataTransforms(selectors: string[], context: RetrieveRun): GroupPlan {
    const { flags, envelope, outputTypes, errorTypes, effectiveScope, outputDirectory } = context;
    const family = 'data-transform';
    if (
      selectors.some(
        (value) =>
          value !== 'data-transform' &&
          (!value.startsWith('data-transform:') || !dataTransformName.test(value.slice(15))),
      )
    )
      return { refusal: 'INVALID_SELECTION', family };
    try {
      operationApiVersion(flags['api-version'], 'data-transform');
    } catch {
      return { refusal: 'INVALID_SCOPE', family };
    }
    if (effectiveScope !== 'default') return { refusal: 'INVALID_SCOPE', family };
    return {
      family,
      run: async (): Promise<GroupOutcome> => {
        let org;
        try {
          org = await this.resolveOrg(flags['target-org']);
        } catch {
          return { status: 'blocked', selection: selectors, code: 'TARGET_ORG_REQUIRED' };
        }
        const connection = org.getConnection('68.0');
        envelope.provenance.sourceOrgId ??= org.getOrgId();
        envelope.metadata.soapApiVersion ??= '68.0';
        const before = envelope.diagnostics.errors.length;
        let failed = false;
        const listed = selectors
          .filter((value) => value !== 'data-transform')
          .map((value) => value.slice(15));
        // Bare data-transform: every transform the API lists, each read on its own.
        if (selectors.includes('data-transform'))
          try {
            listed.push(
              ...(await (this.listDataTransformNames ?? listDataTransformNames)(
                connection,
                envelope.diagnostics.warnings,
              )),
            );
          } catch (error) {
            failed = true;
            this.inventoryFailure(envelope, errorTypes, error, family);
          }
        const names = [...new Set(listed)];
        names.sort();
        outputTypes.add('data-transform');
        const routes: RetrieveRoute[] = [
          { operation: 'data-transform.get', apiVersion: '68.0', transport: 'native' },
          {
            operation: 'data-transform.schedule.get',
            apiVersion: '68.0',
            transport: 'native',
          },
        ];
        for (const apiName of names) {
          let nativeOf = nothingRead;
          try {
            const reads = recordNativeReads(
              this.createDataTransformClient(connection, '68.0', effectiveScope),
            );
            nativeOf = reads.nativeOf;
            const observed = await this.acquireDataTransform(
              apiName,
              reads.client,
              'retrieve',
              envelope.diagnostics.warnings,
            );
            if (observed.document.definition.name !== apiName)
              throw new DataTransformError('TRANSFORM_IDENTITY_MISMATCH');
            const receipt = await this.writeDataTransform(
              observed.document,
              outputDirectory,
              flags.overwrite,
            );
            envelope.result.items.push({
              identity: { dataSpace: effectiveScope, apiName },
              operation: 'retrieve',
              family: 'data-transform',
              routes,
              ...receipt,
            });
          } catch (error_) {
            const error = await this.verbatimFallback(error_, nativeOf(apiName), {
              kind: 'data-transform',
              identity: { dataSpace: effectiveScope, apiName },
              routes,
              root: outputDirectory,
              overwrite: flags.overwrite,
              warnings: envelope.diagnostics.warnings,
              push: (item) => envelope.result.items.push(item),
            });
            if (error === undefined) continue;
            const code =
              error instanceof DataTransformError ? error.code : 'TRANSFORM_RETRIEVE_FAILED';
            if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH', 'INVALID_PROJECT'].includes(code))
              failed = true;
            const diagnostic = {
              code,
              message: operationDiagnostic(
                error,
                'Transform retrieval did not complete; no org write attempted.',
              ),
              retryable: false as const,
              identity: { dataSpace: effectiveScope, apiName },
            };
            envelope.diagnostics.errors.push(diagnostic);
            errorTypes.set(diagnostic, 'data-transform');
          }
        }
        return {
          status: groupStatus(envelope, before, failed),
          selection: names.map((name) => `data-transform:${name}`),
        };
      },
    };
  }

  /**
   * Validate exact data stream selectors, then read them one after another.
   * @param {string[]} selectors The data-stream group.
   * @param {RetrieveRun} context Shared command state.
   * @returns {GroupPlan} A refusal, or the group's read.
   */
  private prepareDataStreams(selectors: string[], context: RetrieveRun): GroupPlan {
    const { flags, envelope, outputTypes, errorTypes, effectiveScope, outputDirectory } = context;
    const family = 'data-stream';
    if (
      selectors.some(
        (value) =>
          value !== 'data-stream' && !/^data-stream:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value),
      )
    )
      return { refusal: 'INVALID_SELECTION', family };
    let version: string;
    try {
      version = dataStreamApiVersion(flags['api-version']);
    } catch {
      return { refusal: 'INVALID_SCOPE', family };
    }
    if (effectiveScope !== 'default') return { refusal: 'INVALID_SCOPE', family };
    return {
      family,
      run: async (): Promise<GroupOutcome> => {
        let org;
        try {
          org = await this.resolveOrg(flags['target-org']);
        } catch {
          return { status: 'blocked', selection: selectors, code: 'TARGET_ORG_REQUIRED' };
        }
        const connection = org.getConnection(version);
        const target = flags['target-org'] ?? connection.getUsername();
        if (!target)
          return { status: 'blocked', selection: selectors, code: 'TARGET_ORG_REQUIRED' };
        envelope.provenance.sourceOrgId ??= org.getOrgId();
        envelope.metadata.soapApiVersion ??= version;
        const before = envelope.diagnostics.errors.length;
        let failed = false;
        const listed = selectors
          .filter((value) => value !== 'data-stream')
          .map((value) => value.slice('data-stream:'.length));
        // Bare data-stream: every stream the API lists, each read on its own.
        if (selectors.includes('data-stream'))
          try {
            listed.push(
              ...(await (this.listDataStreamNames ?? listDataStreamNames)(
                connection,
                version,
                envelope.diagnostics.warnings,
              )),
            );
          } catch (error) {
            failed = true;
            this.inventoryFailure(envelope, errorTypes, error, family);
          }
        const names = [...new Set(listed)];
        names.sort();
        outputTypes.add('data-stream');
        const routes: RetrieveRoute[] = [
          { operation: 'data-stream.get', apiVersion: version, transport: 'native' },
          { operation: 'dlo.get', apiVersion: version, transport: 'native' },
          { operation: 'connection.read', apiVersion: version, transport: 'native' },
        ];
        for (const apiName of names) {
          let nativeOf = nothingRead;
          try {
            const clients = this.createDataStreamClients(connection, target, version);
            // The stream's own GET is the raw response a verbatim file keeps. Salesforce lists
            // the mappings in varying order, so sort them as a modelled file does.
            const reads = recordNativeReads(clients.streams, verbatimStreamNative);
            nativeOf = reads.nativeOf;
            const document = await this.acquireDataStream(
              apiName,
              clients.streams ? { ...clients, streams: reads.client } : clients,
              effectiveScope,
              false,
              'retrieve',
            );
            const receipt = await this.writeDataStream(document, outputDirectory, flags.overwrite);
            envelope.result.items.push({
              identity: document.identity,
              operation: 'retrieve',
              family: 'data-stream',
              routes,
              ...receipt,
            });
          } catch (error_) {
            const error = await this.verbatimFallback(error_, nativeOf(apiName), {
              kind: 'data-stream',
              identity: { dataSpace: effectiveScope, apiName },
              routes,
              root: outputDirectory,
              overwrite: flags.overwrite,
              warnings: envelope.diagnostics.warnings,
              push: (item) => envelope.result.items.push(item),
            });
            if (error === undefined) continue;
            const code =
              error instanceof DataStreamError ? error.code : 'DATA_STREAM_RETRIEVE_FAILED';
            if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH', 'INVALID_PROJECT'].includes(code))
              failed = true;
            const diagnostic = {
              code,
              message: operationDiagnostic(
                error,
                'Data stream retrieval did not complete; no write attempted.',
              ),
              retryable: false as const,
              identity: { dataSpace: effectiveScope, apiName },
            };
            envelope.diagnostics.errors.push(diagnostic);
            errorTypes.set(diagnostic, 'data-stream');
          }
        }
        return {
          status: groupStatus(envelope, before, failed),
          selection: names.map((name) => `data-stream:${name}`),
        };
      },
    };
  }

  /**
   * Validate exact data graph selectors, then read the graphs one after another. A failure of
   * the shared org context blocks the group; a failure of one graph is reported for that graph.
   * @param {string[]} selectors The data-graph group.
   * @param {RetrieveRun} context Shared command state.
   * @returns {GroupPlan} A refusal, or the group's read.
   */
  private prepareDataGraphs(selectors: string[], context: RetrieveRun): GroupPlan {
    const { flags, envelope, outputTypes, errorTypes, effectiveScope, outputDirectory } = context;
    const family = 'data-graph';
    try {
      operationApiVersion(flags['api-version'], 'data-graph');
    } catch {
      return { refusal: 'INVALID_SCOPE', family };
    }
    if (
      selectors.some(
        (value) =>
          value !== 'data-graph' && !/^data-graph:[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(value),
      )
    )
      return { refusal: 'INVALID_SELECTION', family };
    if (effectiveScope !== 'default') return { refusal: 'INVALID_SCOPE', family };
    return {
      family,
      run: async (): Promise<GroupOutcome> => {
        let graphContext: Awaited<ReturnType<typeof nativeDataGraphReadContext>>;
        let connection: Connection;
        try {
          const org = await this.resolveOrg(flags['target-org']);
          connection = org.getConnection('68.0');
          graphContext = await this.nativeGraphContext(connection, 'default');
        } catch (error) {
          return {
            status: 'blocked',
            selection: selectors,
            code: 'NATIVE_GRAPH_RETRIEVE_BLOCKED',
            error,
          };
        }
        envelope.provenance.sourceOrgId ??= graphContext.orgId;
        envelope.metadata.soapApiVersion ??= '68.0';
        // The body of each graph's first successful read is the raw response a verbatim file keeps.
        const reads = recordNativeReads(graphContext, (response) => {
          const read = response as { status?: unknown; body?: unknown } | undefined;
          return read?.status === 200 ? { native: read.body } : undefined;
        });
        graphContext = reads.client;
        const before = envelope.diagnostics.errors.length;
        let failed = false;
        const listed = selectors
          .filter((value) => value !== 'data-graph')
          .map((value) => value.slice('data-graph:'.length));
        // Bare data-graph: every default-space graph the API lists, each read on its own.
        if (selectors.includes('data-graph'))
          try {
            listed.push(
              ...(await (this.listDataGraphNames ?? listDataGraphNames)(
                connection,
                envelope.diagnostics.warnings,
              )),
            );
          } catch (error) {
            failed = true;
            this.inventoryFailure(envelope, errorTypes, error, family);
          }
        const names = [...new Set(listed)];
        names.sort();
        outputTypes.add('data-graph');
        const routes: RetrieveRoute[] = [
          { operation: 'data-graph.get', apiVersion: '68.0', transport: 'native' },
        ];
        for (const apiName of names) {
          try {
            const document = await this.retrieveNativeGraph(apiName, graphContext);
            const receipt = await this.writeDataGraph(document, outputDirectory, flags.overwrite);
            envelope.result.items.push({
              identity: { dataSpace: 'default', apiName },
              operation: 'retrieve',
              family: 'data-graph',
              routes,
              ...receipt,
            });
          } catch (error_) {
            const error = await this.verbatimFallback(error_, reads.nativeOf(apiName), {
              kind: 'native-data-graph',
              identity: { dataSpace: 'default', apiName },
              routes,
              root: outputDirectory,
              overwrite: flags.overwrite,
              warnings: envelope.diagnostics.warnings,
              push: (item) => envelope.result.items.push(item),
            });
            if (error === undefined) continue;
            const diagnostic: RetrieveDiagnostic = {
              code:
                error instanceof DataGraphError && error.code === 'DATA_GRAPH_IDENTITY_MISMATCH'
                  ? error.code
                  : 'NATIVE_GRAPH_RETRIEVE_BLOCKED',
              message: withInnerCode(retrievalMessage(error), error),
              retryable: false,
              identity: { dataSpace: 'default', apiName },
              family: 'data-graph',
            };
            envelope.diagnostics.errors.push(diagnostic);
            errorTypes.set(diagnostic, 'data-graph');
          }
        }
        return {
          status: groupStatus(envelope, before, failed),
          selection: names.map((name) => `data-graph:${name}`),
        };
      },
    };
  }

  /**
   * Validate every other selector (DLO, DMO, mapping, relationship, Segment, calculated
   * insight, identity resolution); an empty selection is every native family.
   * @param {string[]} selectors The selectors of no other group.
   * @param {RetrieveRun} context Shared command state.
   * @returns {GroupPlan} A refusal, or the group's read.
   */
  private prepareRest(selectors: string[], context: RetrieveRun): GroupPlan {
    // Relationships are read per source DMO; bare relationship reads those of every listed DMO.
    const relationshipDmos = [
      ...new Set(
        selectors
          .filter((value) => value.startsWith('relationship:'))
          .map((value) => value.slice('relationship:'.length)),
      ),
    ];
    relationshipDmos.sort();
    return selectors.every(
      (value) =>
        inGroup('relationship', value) ||
        nativeFamilies.some((family) => value === family || value.startsWith(`${family}:`)),
    )
      ? this.prepareNativeRest(selectors, relationshipDmos, context)
      : this.prepareMixedRest(selectors, relationshipDmos, context);
  }

  /**
   * Native-only DLO, DMO, mapping and relationship selection, including type inventory.
   * @param {string[]} selectors The rest group, native families only.
   * @param {string[]} relationshipDmos Exact sorted relationship source DMOs.
   * @param {RetrieveRun} context Shared command state.
   * @returns {GroupPlan} A refusal, or the group's read.
   */
  private prepareNativeRest(
    selectors: string[],
    relationshipDmos: string[],
    context: RetrieveRun,
  ): GroupPlan {
    const { flags, envelope, outputTypes, errorTypes, requestScope, effectiveScope } = context;
    const outputDirectory = context.outputDirectory;
    const label = selectorFamily(selectors[0]);
    let version: string;
    try {
      version = nativeApiVersion(flags['api-version']);
      if (relationshipDmos.some((name) => !relationshipDmoName.test(name)))
        return { refusal: 'INVALID_SELECTION', family: 'relationship' };
      for (const selector of selectors) {
        if (inGroup('relationship', selector)) continue;
        const [family, name, extra] = selector.split(':');
        if (
          extra !== undefined ||
          (name !== undefined &&
            !(
              family === 'dlo' ? dloName : family === 'dmo' ? nativeDmoName : nativeMappingName
            ).test(name))
        )
          return { refusal: 'INVALID_SELECTION', family: selectorFamily(selector) };
      }
    } catch {
      return { refusal: 'INVALID_SCOPE', family: label };
    }
    return {
      family: label,
      run: async (): Promise<GroupOutcome> => {
        let org;
        try {
          org = await this.resolveOrg(flags['target-org']);
        } catch {
          return { status: 'blocked', selection: selectors, code: 'TARGET_ORG_REQUIRED' };
        }
        const connection = org.getConnection(version);
        const target = flags['target-org'] ?? connection.getUsername();
        if (!target)
          return { status: 'blocked', selection: selectors, code: 'TARGET_ORG_REQUIRED' };
        envelope.provenance.sourceOrgId ??= org.getOrgId();
        envelope.metadata.soapApiVersion ??= version;
        const selected = new Map<string, string[]>();
        const before = envelope.diagnostics.errors.length;
        const warnings = envelope.diagnostics.warnings;
        // An inventory that cannot be read fails its family only; the others are still read.
        const inventoryFailures: Array<{ family: RetrieveFamily; error: unknown }> = [];
        // The DMO inventory, read once for both the DMO and the mapping family.
        let dmoInventory: Promise<string[]> | undefined;
        // The listing entries; a listed object's GET answers with its entry (see createDloClient).
        const listed: ListedEntries = { dlo: new Map(), dmo: new Map() };
        const listDmos = async (): Promise<string[]> =>
          (dmoInventory ??= this.listNativeNames(
            connection,
            version,
            'dmo',
            requestScope,
            warnings,
            listed.dmo,
          ));
        // Finish every inventory before publishing any file.
        for (const family of nativeFamilies) {
          const all = selectors.length === 0 || selectors.includes(family);
          let names = selectors
            .filter((value) => value.startsWith(`${family}:`))
            .map((value) => value.slice(family.length + 1));
          if (all)
            try {
              if (family === 'mapping')
                names.push(
                  ...(await this.listNativeMappingNames(
                    await listDmos(),
                    this.createMappingInventoryReader(connection, version, requestScope),
                    requestScope,
                    {
                      warnings,
                      failure: (dmo, error) =>
                        envelope.diagnostics.errors.push({
                          code: 'NATIVE_INVENTORY_FAILED',
                          message: retrievalMessage(error),
                          retryable: false,
                          identity: { dataSpace: effectiveScope, apiName: dmo },
                          family: 'mapping',
                        }),
                    },
                  )),
                );
              else
                names.push(
                  ...(family === 'dmo'
                    ? await listDmos()
                    : await this.listNativeNames(
                        connection,
                        version,
                        family,
                        requestScope,
                        warnings,
                        listed.dlo,
                      )),
                );
            } catch (error) {
              inventoryFailures.push({ family, error });
            }
          names = [...new Set(names)];
          names.sort();
          selected.set(family, names);
        }
        // Bare relationship: the relationships of every DMO the API lists, one DMO at a time.
        const relationshipSources = [...relationshipDmos];
        if (selectors.includes('relationship'))
          try {
            relationshipSources.push(...(await listDmos()));
          } catch (error) {
            inventoryFailures.push({ family: 'relationship', error });
          }
        const relationshipNames = [...new Set(relationshipSources)];
        relationshipNames.sort();
        // Nothing else to read: the one failed inventory is the group's outcome, as before.
        if (
          inventoryFailures.length === 1 &&
          relationshipNames.length === 0 &&
          [...selected.values()].every((names) => names.length === 0) &&
          envelope.diagnostics.errors.length === before
        )
          return {
            status: 'blocked',
            selection: selectors,
            code: inventoryCode(inventoryFailures[0].error),
            error: inventoryFailures[0].error,
            family: inventoryFailures[0].family,
          };
        for (const { family, error } of inventoryFailures)
          envelope.diagnostics.errors.push({
            code: inventoryCode(error),
            message: retrievalMessage(error),
            retryable: false,
            family,
          });
        const selection = [
          // A family whose inventory failed stays in the selection under its bare name.
          ...inventoryFailures.map(({ family }) => family),
          ...[...selected].flatMap(([family, names]) => names.map((name) => `${family}:${name}`)),
          ...relationshipNames.map((name) => `relationship:${name}`),
        ];
        let failed = false;
        for (const family of nativeFamilies) {
          if (
            selectors.length === 0 ||
            selectors.some((selector) => selector === family || selector.startsWith(`${family}:`))
          )
            outputTypes.add(family);
          const routes: RetrieveRoute[] = [
            { operation: `${family}.get`, apiVersion: version, transport: 'native' },
          ];
          for (const apiName of selected.get(family) ?? []) {
            // The item's own client: its GET is the raw response a verbatim file keeps.
            const reads = nativeReadRecorder();
            try {
              const document =
                family === 'mapping'
                  ? await this.acquireNativeMapping(
                      apiName,
                      reads.wrap(
                        this.createMappingClient(
                          target,
                          version,
                          undefined,
                          requestScope,
                          this.ssotSender(target, version, connection),
                        ),
                      ),
                      requestScope,
                      this.mappingParents(
                        target,
                        version,
                        this.ssotSender(target, version, connection),
                        listed,
                      ),
                      'retrieve',
                    )
                  : family === 'dlo'
                    ? await this.acquireDlo(
                        apiName,
                        reads.wrap(
                          this.createDloClient(
                            target,
                            version,
                            this.ssotSender(target, version, connection),
                            listed.dlo,
                          ),
                        ),
                        // The scope it is read in binds a DLO that belongs to several spaces.
                        effectiveScope,
                        'retrieve',
                      )
                    : await (this.acquireNativeDmo ?? retrieveNativeDmo)(
                        apiName,
                        reads.wrap(
                          this.createDmoClient(
                            target,
                            version,
                            undefined,
                            this.ssotSender(target, version, connection),
                            listed.dmo,
                          ),
                        ),
                        requestScope,
                        'retrieve',
                      );
              const root = outputDirectory;
              const receipt =
                document.kind === 'mapping'
                  ? await this.writeNativeMapping(document, root, flags.overwrite)
                  : document.kind === 'dlo'
                    ? await this.writeDlo(document, root, flags.overwrite)
                    : await (this.writeNativeDmo ?? writeNativeDmoDocument)(
                        document,
                        root,
                        flags.overwrite,
                      );
              envelope.result.items.push({
                identity: document.identity,
                operation: 'retrieve',
                ...(family === 'dmo' ? {} : { family }),
                routes,
                ...receipt,
              });
            } catch (error_) {
              const error = await this.verbatimFallback(error_, reads.nativeOf(apiName), {
                kind: family,
                identity: { dataSpace: effectiveScope, apiName },
                routes,
                root: outputDirectory,
                overwrite: flags.overwrite,
                warnings: envelope.diagnostics.warnings,
                push: (item) => envelope.result.items.push(item),
              });
              if (error === undefined) continue;
              const code =
                error instanceof NativeMappingError ||
                error instanceof NativeDmoError ||
                error instanceof MappingDefinitionError ||
                error instanceof DloError
                  ? error.code
                  : 'NATIVE_RETRIEVE_FAILED';
              if (!['OVERWRITE_REQUIRED', 'UNSAFE_PATH', 'INVALID_PROJECT'].includes(code))
                failed = true;
              envelope.diagnostics.errors.push({
                code,
                message: operationDiagnostic(
                  error,
                  'Native component retrieval did not complete; no write attempted.',
                ),
                retryable: false,
                identity: { dataSpace: effectiveScope, apiName },
                ...(family === 'mapping' ? { family } : {}),
              });
              errorTypes.set(envelope.diagnostics.errors.at(-1)!, family);
            }
          }
        }
        if (relationshipNames.length > 0 || selectors.includes('relationship')) {
          outputTypes.add('relationship');
          const relationships = await this.retrieveRelationshipFamily(
            relationshipNames,
            connection,
            target,
            version,
            requestScope,
            outputDirectory,
            flags.overwrite,
          );
          envelope.result.items.push(...relationships.items);
          envelope.diagnostics.errors.push(...relationships.errors);
          envelope.diagnostics.warnings.push(...relationships.warnings);
          if (relationships.failed) failed = true;
        }
        return { status: groupStatus(envelope, before, failed), selection };
      },
    };
  }

  /**
   * DLO, mapping, relationship, DMO, Segment, calculated insight and identity resolution
   * selections that are not native-only.
   * @param {string[]} selectors The rest group.
   * @param {string[]} relationshipDmos Exact sorted relationship source DMOs.
   * @param {RetrieveRun} context Shared command state.
   * @returns {GroupPlan} A refusal, or the group's read.
   */
  private prepareMixedRest(
    selectors: string[],
    relationshipDmos: string[],
    context: RetrieveRun,
  ): GroupPlan {
    const { flags, envelope, outputTypes, errorTypes, requestScope, effectiveScope } = context;
    const outputDirectory = context.outputDirectory;
    const label = selectorFamily(selectors[0]);
    // The family whose check runs, named in a refusal beside other groups.
    let family: RetrieveFamily = label;
    if (effectiveScope !== 'default') return { refusal: 'INVALID_SCOPE', family };
    const dloSelectors = selectors.filter((value) => value === 'dlo' || value.startsWith('dlo:'));
    const mappingSelectors = selectors.filter((value) => value.startsWith('mapping:'));
    const ciSelectors = selectors.filter((value) => inGroup('calculated-insight', value));
    const irSelectors = selectors.filter((value) => inGroup('identity-resolution', value));
    const segmentSelectors = selectors.filter((value) => inGroup('segment', value));
    const dmoSelectors = selectors.filter(
      (value) =>
        value !== 'dlo' &&
        !value.startsWith('dlo:') &&
        !value.startsWith('mapping:') &&
        !inGroup('relationship', value) &&
        !inGroup('segment', value) &&
        !inGroup('identity-resolution', value) &&
        !inGroup('calculated-insight', value),
    );
    const hasDmos = dmoSelectors.length > 0;
    let effectiveVersion: string;
    try {
      family = 'dlo';
      if (dloSelectors.length > 0) {
        if (dloSelectors.some((value) => value !== 'dlo' && !dloName.test(value.slice(4))))
          return { refusal: 'INVALID_SELECTION', family };
        if (!['68.0', 'auto'].includes(flags['api-version']) || effectiveScope !== 'default')
          return { refusal: 'INVALID_SCOPE', family };
      }
      family = 'mapping';
      if (selectors.includes('mapping'))
        throw new MappingDefinitionError('MAPPING_INVENTORY_UNQUALIFIED');
      if (mappingSelectors.length > 0) {
        nativeApiVersion(flags['api-version']);
        if (effectiveScope !== 'default') throw new MappingDefinitionError('INVALID_SCOPE');
        if (mappingSelectors.some((value) => !mappingName.test(value.slice(8))))
          throw new MappingDefinitionError('INVALID_SELECTION');
      }
      family = 'relationship';
      if (relationshipDmos.length > 0 || selectors.includes('relationship')) {
        nativeApiVersion(flags['api-version']);
        if (relationshipDmos.some((name) => !relationshipDmoName.test(name)))
          throw new NativeRelationshipError('INVALID_SELECTION');
      }
      family = 'calculated-insight';
      if (ciSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'calculated-insight');
        if (effectiveScope !== 'default') throw new CalculatedInsightError('INVALID_SCOPE');
        if (
          ciSelectors.some(
            (value) =>
              value !== 'calculated-insight' && !calculatedInsightName.test(value.slice(19)),
          )
        )
          throw new CalculatedInsightError('INVALID_SELECTION');
      }
      family = 'identity-resolution';
      if (
        irSelectors.some(
          (value) =>
            value !== 'identity-resolution' && !identityResolutionName.test(value.slice(20)),
        )
      )
        throw new IdentityResolutionError('INVALID_SELECTION');
      if (irSelectors.length > 0) {
        operationApiVersion(flags['api-version'], 'identity-resolution');
        if (effectiveScope !== 'default') throw new IdentityResolutionError('INVALID_SCOPE');
      }
      family = 'segment';
      if (segmentSelectors.length > 0) operationApiVersion(flags['api-version'], 'segment');
      family = 'dmo';
      // A DMO is read natively at its own version and never pins the other families.
      if (hasDmos) nativeApiVersion(flags['api-version']);
      const sharedFamily =
        segmentSelectors.length > 0
          ? 'segment'
          : ciSelectors.length > 0
            ? 'calculated-insight'
            : irSelectors.length > 0
              ? 'identity-resolution'
              : undefined;
      family = sharedFamily ?? label;
      effectiveVersion =
        dloSelectors.length === selectors.length && dloSelectors.length > 0
          ? '68.0'
          : sharedFamily
            ? operationApiVersion(flags['api-version'], sharedFamily)
            : hasDmos || mappingSelectors.length > 0
              ? nativeApiVersion(flags['api-version'])
              : operationApiVersion(flags['api-version'], 'dlo');
    } catch (error: unknown) {
      return {
        refusal:
          error instanceof MappingDefinitionError ||
          error instanceof NativeRelationshipError ||
          error instanceof DloError ||
          error instanceof IdentityResolutionError ||
          error instanceof CalculatedInsightError
            ? error.code
            : 'INVALID_SCOPE',
        family,
      };
    }
    try {
      family = 'segment';
      if (
        segmentSelectors.some((value) => value !== 'segment' && !segmentName.test(value.slice(8)))
      )
        throw new SegmentError('INVALID_SELECTION');
      if (
        segmentSelectors.length > 0 &&
        (effectiveVersion !== '68.0' || effectiveScope !== 'default')
      )
        throw new SegmentError('INVALID_SCOPE');
      family = 'dmo';
      // Validate DMO selector syntax before auth; unknown families land here and are refused.
      if (
        dmoSelectors.some(
          (value) =>
            value !== 'dmo' && !(value.startsWith('dmo:') && nativeDmoName.test(value.slice(4))),
        )
      )
        return { refusal: 'INVALID_SELECTION', family };
    } catch (error: unknown) {
      return {
        refusal: error instanceof SegmentError ? error.code : 'INVALID_SELECTION',
        family,
      };
    }
    return {
      family: label,
      run: async (): Promise<GroupOutcome> => {
        let org: Pick<Org, 'getConnection' | 'getOrgId'>;
        try {
          org = await this.resolveOrg(flags['target-org']);
        } catch {
          return { status: 'blocked', selection: selectors, code: 'TARGET_ORG_REQUIRED' };
        }
        let selection = selectors;
        const before = envelope.diagnostics.errors.length;
        let failed = false;
        // An inventory that cannot be read fails its family only; the other selectors still run.
        const inventoryFailure = (error: unknown, family: RetrieveFamily): void => {
          envelope.diagnostics.errors.push({
            code:
              error instanceof CalculatedInsightError ||
              error instanceof SegmentError ||
              error instanceof IdentityResolutionError ||
              error instanceof ConnectError
                ? error.code
                : 'NATIVE_INVENTORY_FAILED',
            message: retrievalMessage(error),
            retryable: false,
            family,
          });
          errorTypes.set(envelope.diagnostics.errors.at(-1)!, family);
          if (error instanceof ConnectError) failed = true;
        };
        const diagnose = (error: unknown, apiName?: string, family = 'dmo'): void => {
          let code = 'RETRIEVE_FAILED';
          if (
            error instanceof DloError ||
            error instanceof CalculatedInsightError ||
            error instanceof IdentityResolutionError ||
            error instanceof SegmentError ||
            error instanceof DependencySelectionError ||
            error instanceof RetrieveSelectionError ||
            error instanceof NativeDmoError ||
            error instanceof ConnectError
          )
            code = error.code;
          else failed = true;
          if (
            code === 'IDENTITY_RESOLUTION_ACQUISITION_FAILED' ||
            code === 'OUTPUT_FAILED' ||
            code === 'PARTIAL_DMO_OUTPUT' ||
            code === 'PARTIAL_SEGMENT_OUTPUT' ||
            code === 'SEGMENT_ACQUISITION_FAILED' ||
            code === 'DEPENDENCY_ACQUISITION_FAILED' ||
            code === 'SEGMENT_DEPENDENCY_ACQUISITION_FAILED' ||
            error instanceof ConnectError ||
            code === 'ACQUISITION_FAILED'
          )
            failed = true;
          if (error instanceof RetrieveSelectionError) {
            apiName = error.identity.apiName;
            family = error.identity.kind;
          }
          envelope.diagnostics.errors.push({
            code,
            message: getConnectDiagnostic(error)
              ? operationDiagnostic(
                  error,
                  'This component was not retrieved; no files were written for it.',
                )
              : apiName
                ? (calculatedInsightRetrieveMessages[code] ??
                  'This component was not retrieved. Resolve its capability, acquisition or output diagnostic.')
                : 'The selection could not be retrieved completely; no files were written.',
            retryable: false,
            ...(apiName ? { identity: { dataSpace: effectiveScope, apiName } } : {}),
          });
          errorTypes.set(envelope.diagnostics.errors.at(-1)!, family);
        };
        try {
          envelope.provenance.sourceOrgId ??= org.getOrgId();
          // Every remaining route is a fixed numeric pin; nothing is discovered from the org.
          const versions = await resolveApiVersion(effectiveVersion, async () => {
            throw new Error('Fixed route must not discover.');
          });
          envelope.metadata.soapApiVersion ??= versions.soapNumeric;
          // Definition-only members are independent; retain successes across read/output failures.

          let dlos = dloSelectors.filter((value) => value !== 'dlo').map((value) => value.slice(4));
          // The listing entries; a listed object's GET answers with its entry (see createDloClient).
          const listed: ListedEntries = { dlo: new Map(), dmo: new Map() };
          // Bare dlo: every DLO the API lists, read before any file is written.
          if (dloSelectors.includes('dlo'))
            try {
              dlos.push(
                ...(await this.listNativeNames(
                  org.getConnection('68.0'),
                  '68.0',
                  'dlo',
                  'default',
                  envelope.diagnostics.warnings,
                  listed.dlo,
                )),
              );
            } catch (error: unknown) {
              inventoryFailure(error, 'dlo');
            }
          dlos = [...new Set(dlos)];
          dlos.sort();
          const dloRoutes: RetrieveRoute[] = [
            { operation: 'dlo.get', apiVersion: '68.0', transport: 'native' },
          ];
          for (const apiName of dlos) {
            let nativeOf = nothingRead;
            try {
              const target =
                flags['target-org'] ?? org.getConnection(flags['api-version']).getUsername();
              if (!target) throw new SegmentError('TARGET_ORG_REQUIRED');
              const reads = recordNativeReads(
                this.createDloClient(
                  target,
                  '68.0',
                  this.ssotSender(target, '68.0', org.getConnection()),
                  listed.dlo,
                ),
              );
              nativeOf = reads.nativeOf;
              const document = await this.acquireDlo(apiName, reads.client, 'default', 'retrieve');
              const receipt = await this.writeDlo(document, outputDirectory, flags.overwrite);
              envelope.result.items.push({
                identity: { dataSpace: 'default', apiName },
                operation: 'retrieve',
                family: 'dlo',
                routes: dloRoutes,
                ...receipt,
              });
            } catch (error_: unknown) {
              const error = await this.verbatimFallback(error_, nativeOf(apiName), {
                kind: 'dlo',
                identity: { dataSpace: 'default', apiName },
                routes: dloRoutes,
                root: outputDirectory,
                overwrite: flags.overwrite,
                warnings: envelope.diagnostics.warnings,
                push: (item) => envelope.result.items.push(item),
              });
              if (error === undefined) continue;
              diagnose(error, apiName, 'dlo');
              if (
                !(error instanceof SegmentError) ||
                ![
                  'OVERWRITE_REQUIRED',
                  'UNSAFE_PATH',
                  'TARGET_ORG_REQUIRED',
                  'INVALID_PROJECT',
                ].includes(error.code)
              )
                failed = true;
            }
          }
          const mappings = [...new Set(mappingSelectors.map((value) => value.slice(8)))];
          mappings.sort();
          for (const apiName of mappings) {
            let nativeOf = nothingRead;
            let routes: RetrieveRoute[] = [];
            try {
              const version = nativeApiVersion(flags['api-version']);
              routes = [{ operation: 'mapping.get', apiVersion: version, transport: 'native' }];
              const target = flags['target-org'] ?? org.getConnection(version).getUsername();
              if (!target) throw new MappingDefinitionError('TARGET_ORG_REQUIRED');
              const reads = recordNativeReads(
                this.createMappingClient(
                  target,
                  version,
                  undefined,
                  requestScope,
                  this.ssotSender(target, version, org.getConnection()),
                ),
              );
              nativeOf = reads.nativeOf;
              const document = await this.acquireNativeMapping(
                apiName,
                reads.client,
                requestScope,
                this.mappingParents(
                  target,
                  version,
                  this.ssotSender(target, version, org.getConnection()),
                ),
                'retrieve',
              );
              const receipt = await this.writeNativeMapping(
                document,
                outputDirectory,
                flags.overwrite,
              );
              envelope.result.items.push({
                identity: { dataSpace: 'default', apiName },
                operation: 'retrieve',
                family: 'mapping',
                routes,
                ...receipt,
              });
            } catch (error_: unknown) {
              const error = await this.verbatimFallback(error_, nativeOf(apiName), {
                kind: 'mapping',
                identity: { dataSpace: 'default', apiName },
                routes,
                root: outputDirectory,
                overwrite: flags.overwrite,
                warnings: envelope.diagnostics.warnings,
                push: (item) => envelope.result.items.push(item),
              });
              if (error === undefined) continue;
              const unproven =
                error instanceof NativeMappingError &&
                error.code === 'MAPPING_GENERATED_PAIRS_UNPROVEN';
              const code =
                error instanceof MappingDefinitionError || unproven ? error.code : 'OUTPUT_FAILED';
              if (
                ![
                  'INVALID_SELECTION',
                  'INVALID_SCOPE',
                  'OVERWRITE_REQUIRED',
                  'UNSAFE_PATH',
                  'TARGET_ORG_REQUIRED',
                ].includes(code)
              )
                failed = true;
              envelope.diagnostics.errors.push({
                code,
                family: 'mapping',
                identity: { dataSpace: 'default', apiName },
                message: unproven
                  ? operationDiagnostic(error, 'This mapping definition was not exported.')
                  : 'This mapping definition was not exported. Check the exact selection, acquisition and output path.',
                retryable: false,
              });
            }
          }
          let relationshipNames = [...relationshipDmos];
          if (selectors.includes('relationship')) {
            // Bare relationship: the relationships of every DMO the API lists.
            const version = nativeApiVersion(flags['api-version']);
            try {
              relationshipNames.push(
                ...(await this.listNativeNames(
                  org.getConnection(version),
                  version,
                  'dmo',
                  effectiveScope,
                  envelope.diagnostics.warnings,
                )),
              );
            } catch (error: unknown) {
              inventoryFailure(error, 'relationship');
            }
            relationshipNames = [...new Set(relationshipNames)];
            relationshipNames.sort();
          }
          if (relationshipNames.length > 0) {
            const target = flags['target-org'] ?? org.getConnection().getUsername();
            if (target) {
              const relationships = await this.retrieveRelationshipFamily(
                relationshipNames,
                org.getConnection(),
                target,
                nativeApiVersion(flags['api-version']),
                requestScope,
                outputDirectory,
                flags.overwrite,
              );
              envelope.result.items.push(...relationships.items);
              envelope.diagnostics.errors.push(...relationships.errors);
              envelope.diagnostics.warnings.push(...relationships.warnings);
              if (relationships.failed) failed = true;
            } else
              envelope.diagnostics.errors.push({
                code: 'TARGET_ORG_REQUIRED',
                family: 'relationship',
                message: 'Relationships were not retrieved; no target org username was resolved.',
                retryable: false,
              });
          }
          // Pin only this command-owned connection, before any service uses it.
          const connection = org.getConnection(versions.soapNumeric);
          // The family pin of this path does not apply to native DMO reads (auto is 68.0).
          const nativeDmoVersion = nativeApiVersion(flags['api-version']);
          let names: string[] = [];
          if (hasDmos) {
            names = dmoSelectors
              .filter((selector) => selector !== 'dmo')
              .map((selector) => selector.slice(4));
            if (dmoSelectors.includes('dmo'))
              try {
                names.push(
                  ...(await this.listNativeNames(
                    connection,
                    nativeDmoVersion,
                    'dmo',
                    effectiveScope,
                    envelope.diagnostics.warnings,
                    listed.dmo,
                  )),
                );
              } catch (error: unknown) {
                inventoryFailure(error, 'dmo');
              }
            names = [...new Set(names)];
            names.sort();
          }
          if (hasDmos) outputTypes.add('dmo');
          for (const selector of selectors) outputTypes.add(selector.split(':')[0]);
          const segmentNames = segmentSelectors
            .filter((value) => value !== 'segment')
            .map((value) => value.slice(8));
          // Bare segment: every default-space segment the API lists, each read on its own.
          if (segmentSelectors.includes('segment'))
            try {
              segmentNames.push(
                ...(await (this.listSegmentNames ?? listSegmentNames)(
                  connection,
                  envelope.diagnostics.warnings,
                )),
              );
            } catch (error: unknown) {
              inventoryFailure(error, 'segment');
            }
          // eslint-disable-next-line unicorn/no-array-sort -- Deterministic ordering on a new deduplicated array.
          const segments = [...new Set(segmentNames)].sort();
          selection = [
            ...dlos.map((name) => `dlo:${name}`),
            ...mappings.map((name) => `mapping:${name}`),
            ...relationshipNames.map((name) => `relationship:${name}`),
            ...names.map((name) => `dmo:${name}`),
            ...segments.map((name) => `segment:${name}`),
          ];
          // Acquire and resolve the complete bounded selection before publishing any files.
          const selected =
            names.length > 0 || segments.length > 0
              ? await (this.acquireSelection ?? acquireRetrieveSelection)(
                  [
                    ...names.map((apiName) => ({
                      kind: 'dmo' as const,
                      dataSpace: effectiveScope,
                      apiName,
                    })),
                    ...segments.map((apiName) => ({
                      kind: 'segment' as const,
                      dataSpace: effectiveScope,
                      apiName,
                    })),
                  ],
                  connection,
                  versions,
                  {
                    dmo: async (apiName: string): Promise<unknown> => {
                      const target = flags['target-org'] ?? connection.getUsername();
                      if (!target) throw new NativeDmoError('TARGET_ORG_REQUIRED');
                      return (this.createDmoClient ?? createDmoClient)(
                        target,
                        nativeDmoVersion,
                        undefined,
                        this.ssotSender(target, nativeDmoVersion, connection),
                        listed.dmo,
                      ).get(apiName);
                    },
                  },
                  // One DMO or Segment failing never blocks the others.
                  (error) => diagnose(error),
                  // A Segment whose DMO cannot be bound is still written, with a warning.
                  (warning) => envelope.diagnostics.warnings.push(warning),
                )
              : [];
          const calculatedInsights: Array<
            | {
                document: {
                  kind: 'calculated-insight';
                  identity: { dataSpace: string; apiName: string };
                };
                insight: NativeCalculatedInsight;
              }
            | { document: VerbatimDocument }
          > = [];
          if (ciSelectors.length > 0) {
            // Every CI is read before any selected output (API 68 GET only).
            const ciConnection = org.getConnection('68.0');
            const ciNames = ciSelectors
              .filter((value) => value !== 'calculated-insight')
              .map((value) => value.slice(19));
            // Bare calculated-insight: every insight the API lists in the data space.
            if (ciSelectors.includes('calculated-insight'))
              try {
                ciNames.push(
                  ...(await this.listCalculatedInsightNames(
                    ciConnection,
                    effectiveScope,
                    envelope.diagnostics.warnings,
                  )),
                );
              } catch (error: unknown) {
                inventoryFailure(error, 'calculated-insight');
              }
            // Each insight's GET is the raw response a verbatim file keeps.
            const ciReads = recordNativeReads(
              this.createCalculatedInsightClient(ciConnection, '68.0', effectiveScope),
            );
            // eslint-disable-next-line unicorn/no-array-sort -- Deterministic CI order on a new array.
            for (const apiName of [...new Set(ciNames)].sort()) {
              try {
                const insight = await this.acquireCalculatedInsight(
                  ciReads.client,
                  apiName,
                  effectiveScope,
                );
                calculatedInsights.push({
                  document: {
                    kind: 'calculated-insight',
                    identity: { dataSpace: insight.dataSpace, apiName },
                  },
                  insight: carryNativeResponse(insight, ciReads.nativeOf(apiName)?.native),
                });
              } catch (error: unknown) {
                const verbatim = this.verbatimFor(
                  error,
                  ciReads.nativeOf(apiName),
                  'calculated-insight',
                  { dataSpace: effectiveScope, apiName },
                );
                if (verbatim) {
                  calculatedInsights.push({ document: verbatim });
                  continue;
                }
                // One insight failing never blocks the others.
                diagnose(error, apiName, 'calculated-insight');
              }
            }
          }
          const identityResolutions: Array<{
            document: IdentityResolutionDocument | VerbatimDocument;
          }> = [];
          if (irSelectors.length > 0) {
            const irVersion = await resolveApiVersion('68.0', async () => {
              throw new Error('Fixed route must not discover.');
            });
            const irConnection = org.getConnection('68.0');
            const irNames = irSelectors
              .filter((value) => value !== 'identity-resolution')
              .map((value) => value.slice(20));
            // Bare identity-resolution: every default-space ruleset the API lists.
            if (irSelectors.includes('identity-resolution'))
              try {
                irNames.push(
                  ...(await (this.listIdentityResolutionNames ?? listIdentityResolutionNames)(
                    irConnection,
                    envelope.diagnostics.warnings,
                  )),
                );
              } catch (error: unknown) {
                inventoryFailure(error, 'identity-resolution');
              }
            for (const apiName of [
              ...new Set(irNames),
              // eslint-disable-next-line unicorn/no-array-sort -- Sort a detached selector list within the ES2022 library target.
            ].sort()) {
              // The raw GET response travels with the acquisition, for a verbatim file.
              let read: { native: unknown } | undefined;
              try {
                const acquired = await this.acquireIdentityResolution(
                  irConnection,
                  apiName,
                  irVersion,
                  effectiveScope,
                  'retrieve',
                );
                read = carriedNativeResponse(acquired);
                if (acquired.blockers.length > 0 || !acquired.candidate)
                  throw retainConnectDiagnostic(
                    new IdentityResolutionError(
                      acquired.blockers[0] ?? 'INCOMPLETE_IDENTITY_RESOLUTION',
                    ),
                    getConnectDiagnostic(acquired),
                  );
                const document = validateIdentityResolutionDocument(acquired.candidate, 'retrieve');
                if (
                  acquired.identity.apiName !== apiName ||
                  acquired.identity.dataSpace !== effectiveScope ||
                  document.identity.apiName !== apiName ||
                  document.identity.dataSpace !== effectiveScope
                )
                  throw new IdentityResolutionError('IDENTITY_RESOLUTION_IDENTITY_MISMATCH');
                identityResolutions.push({
                  document: read ? carryNativeResponse(document, read.native) : document,
                });
              } catch (error: unknown) {
                const verbatim = this.verbatimFor(error, read, 'identity-resolution', {
                  dataSpace: effectiveScope,
                  apiName,
                });
                if (verbatim) {
                  identityResolutions.push({ document: verbatim });
                  continue;
                }
                // One identity resolution failing never blocks the others.
                diagnose(error, apiName, 'identity-resolution');
              }
            }
          }
          const entries = [...selected, ...calculatedInsights, ...identityResolutions];
          selection = [
            ...dlos.map((name) => `dlo:${name}`),
            ...mappings.map((name) => `mapping:${name}`),
            ...relationshipNames.map((name) => `relationship:${name}`),
            ...entries.map(({ document }) => `${document.kind}:${document.identity.apiName}`),
          ];
          for (const entry of entries) {
            const { document } = entry;
            // dmo, segment, identity-resolution or calculated-insight (also as a verbatim file).
            const kind = document.kind as VerbatimKind;
            const routes: RetrieveRoute[] = [
              kind === 'identity-resolution'
                ? { operation: 'identity-resolutions.get', apiVersion: '68.0', transport: 'native' }
                : {
                    operation: `${kind}.get`,
                    // A DMO here is always one native read.
                    apiVersion:
                      kind === 'calculated-insight'
                        ? '68.0'
                        : kind === 'dmo'
                          ? nativeDmoVersion
                          : versions.soapNumeric,
                    transport: 'native',
                  },
            ];
            try {
              const receipt =
                'insight' in entry
                  ? await this.writeCalculatedInsight(
                      entry.insight,
                      outputDirectory,
                      flags.overwrite,
                    )
                  : await this.documentWriter(kind)(document, outputDirectory, flags.overwrite);
              envelope.result.items.push({
                identity: { ...document.identity },
                ...(kind === 'dmo' ? {} : { family: kind as RetrieveItem['family'] }),
                routes,
                operation: 'retrieve',
                ...receipt,
                ...(isVerbatimDocument(document)
                  ? await this.noteVerbatim(document, receipt.path, envelope.diagnostics.warnings)
                  : {}),
              });
            } catch (error_: unknown) {
              const error = await this.verbatimFallback(
                error_,
                carriedNativeResponse('insight' in entry ? entry.insight : document),
                {
                  kind,
                  identity: { ...document.identity },
                  routes,
                  root: outputDirectory,
                  overwrite: flags.overwrite,
                  warnings: envelope.diagnostics.warnings,
                  push: (item) => envelope.result.items.push(item),
                },
              );
              if (error === undefined) continue;
              // One file failing never blocks the others; references are not provisioned.
              diagnose(error, document.identity.apiName, document.kind);
            }
          }
        } catch (error: unknown) {
          diagnose(error);
        }
        return { status: groupStatus(envelope, before, failed), selection };
      },
    };
  }

  /**
   * Retrieve any mix of families. Every selector group is validated before any org access; the
   * groups then run one after another (rest, data-stream, data-transform, data-graph) into one
   * envelope.
   * @returns {Promise<RetrieveEnvelope>} Versioned retrieval outcome and payload-free diagnostics.
   */
  public async run(): Promise<RetrieveEnvelope> {
    // Each output directory's ancestor chain is checked once per run; every file still is.
    return withCheckedDirectories(async () => this.retrieveAll());
  }

  /**
   * The run itself; see run.
   * @returns {Promise<RetrieveEnvelope>} Versioned retrieval outcome and payload-free diagnostics.
   */
  private async retrieveAll(): Promise<RetrieveEnvelope> {
    const { flags } = await this.parse(Retrieve);
    const requestScope = flags.dataspace;
    const effectiveScope = requestScope ?? 'default';
    // Writers require an absolute project root; resolve a relative -d against the cwd once.
    const outputDirectory = path.resolve(flags['output-dir'] ?? process.cwd());
    const plugin = {
      name: packageMetadata.name,
      version: packageMetadata.version,
    };
    const envelope: RetrieveEnvelope = {
      contract: 'sf-data360-retrieve',
      contractVersion: '1.0.0',
      status: 'blocked',
      metadata: { operation: 'retrieve', plugin, apiVersion: flags['api-version'] },
      diagnostics: { warnings: [], errors: [] },
      provenance: {
        producer: plugin.name,
        // eslint-disable-next-line unicorn/no-null -- Stable JSON envelope represents unresolved org identity explicitly.
        sourceOrgId: null,
        pluginVersion: plugin.version,
        command: 'sf data360 retrieve',
        generatedAt: new Date().toISOString(),
      },
      result: {
        scope: {
          dataSpace: effectiveScope,
          outputDir: outputDirectory,
        },
        selection: flags.metadata ?? [],
        items: [],
      },
    };
    const outputTypes = new Set<string>();
    const errorTypes = new Map<RetrieveDiagnostic, string>();
    const finish = (
      status: RetrieveEnvelope['status'],
      code?: string,
      error?: unknown,
      family?: RetrieveFamily,
    ): RetrieveEnvelope => {
      envelope.status = status;
      if (code)
        envelope.diagnostics.errors.push({
          code,
          message: family
            ? `Retrieval did not start: the ${family} selection was refused, so nothing was read. Check the ${family} selection, --api-version and --dataspace.`
            : retrievalMessage(error),
          retryable: false,
          ...(family ? { family } : {}),
        });
      if (status !== 'success') process.exitCode = 1;
      annotateDiagnostics(envelope);
      if (!this.jsonEnabled()) {
        this.log(`Retrieve: ${status}${code ? ` (${code})` : ''}.`);
        const groups = new Set([
          ...outputTypes,
          ...envelope.result.items.map((item) => item.family ?? 'dmo'),
        ]);
        const printError = (diagnostic: RetrieveDiagnostic): void => {
          this.log(
            formatDiagnostic(
              diagnostic,
              diagnostic.identity
                ? `${errorTypes.get(diagnostic) ?? diagnostic.family ?? 'dmo'}:${diagnostic.identity.apiName}: `
                : '',
            ),
          );
        };
        for (const family of groups) {
          const items = envelope.result.items.filter((item) => (item.family ?? 'dmo') === family);
          for (const item of items)
            this.log(`Downloaded ${family}:${item.identity.apiName} (${item.outcome}).`);
          for (const diagnostic of envelope.diagnostics.errors)
            if (
              diagnostic.identity &&
              (errorTypes.get(diagnostic) ?? diagnostic.family ?? 'dmo') === family
            )
              printError(diagnostic);
          this.log(`Downloaded ${family}: ${items.length}`);
        }
        for (const diagnostic of envelope.diagnostics.errors)
          if (
            !diagnostic.identity ||
            !groups.has(errorTypes.get(diagnostic) ?? diagnostic.family ?? 'dmo')
          )
            printError(diagnostic);
        for (const warning of envelope.diagnostics.warnings) this.log(`Warning: ${warning}`);
      }
      return envelope;
    };
    const context: RetrieveRun = {
      flags,
      envelope,
      outputTypes,
      errorTypes,
      requestScope,
      effectiveScope,
      outputDirectory,
    };
    const groups = groupSelectors(flags.metadata ?? []);
    const plans: Array<{
      family: RetrieveFamily;
      members: string[];
      run: () => Promise<GroupOutcome>;
    }> = [];
    // Validate every group before any org access; the first refusal blocks the whole run.
    for (const [group, members] of groups) {
      const plan =
        group === 'data-stream'
          ? this.prepareDataStreams(members, context)
          : group === 'data-transform'
            ? this.prepareDataTransforms(members, context)
            : group === 'data-graph'
              ? this.prepareDataGraphs(members, context)
              : this.prepareRest(members, context);
      if ('refusal' in plan)
        return groups.length === 1
          ? finish('blocked', plan.refusal)
          : finish('blocked', plan.refusal, undefined, plan.family);
      plans.push({ ...plan, members });
    }
    if (plans.length === 1) {
      const outcome = await plans[0].run();
      envelope.result.selection = outcome.selection;
      return finish(outcome.status, outcome.code, outcome.error);
    }
    const statuses: Array<RetrieveEnvelope['status']> = [];
    const selection: string[] = [];
    // Each group resolves its own org connection, so no API version pin leaks between groups.
    for (const plan of plans) {
      let outcome: GroupOutcome;
      try {
        outcome = await plan.run();
      } catch (error: unknown) {
        // A throw that escapes one group fails that group only; the other groups still run.
        outcome = { status: 'failed', selection: plan.members, code: 'RETRIEVE_FAILED', error };
      }
      statuses.push(outcome.status);
      selection.push(...outcome.selection);
      if (outcome.code)
        envelope.diagnostics.errors.push({
          code: outcome.code,
          message: retrievalMessage(outcome.error),
          retryable: false,
          family: outcome.family ?? plan.family,
        });
    }
    envelope.result.selection = selection;
    return finish(
      statuses.includes('failed') ? 'failed' : statuses.includes('blocked') ? 'blocked' : 'success',
    );
  }
}
