import './check-temporary.mjs';
import { validateSegmentAcceptanceProfile } from './segment-acceptance-controls.mjs';

const metadata = 'http://soap.sforce.com/2006/04/metadata';
const soap = 'http://schemas.xmlsoap.org/soap/envelope/';
const jobPattern = /^09S[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/u;
const refuse = () => {
  // Never attach XML, parser diagnostics, session IDs or raw server messages.
  throw new Error('SEGMENT_ACCEPTANCE: SOAP evidence refused');
};

/**
 * Read the deliberately small SOAP grammar; no entities, DTD, comments or arbitrary attributes.
 * @param {string} xml Actual detached UTF-8 body.
 * @param {number} limit Maximum body size in UTF-16 code units.
 * @returns {object} Namespace-resolved bounded element tree.
 */
function document(xml, limit) {
  if (
    typeof xml !== 'string' ||
    xml.length > limit ||
    xml.includes('&') ||
    [...xml].some(
      (character) => character.codePointAt(0) < 32 && !['\t', '\n', '\r'].includes(character),
    )
  )
    refuse();
  xml = xml.replace(/^<\?xml version="1\.0" encoding="UTF-8"\?>/u, '');
  const tokens = xml.match(/<[^>]*>|[^<]+/gu) ?? [];
  if (tokens.join('') !== xml) refuse();
  const stack = [];
  let root;
  let count = 0;
  for (const token of tokens) {
    if (!token.startsWith('<')) {
      if (stack.length === 0) {
        if (token.trim()) refuse();
      } else stack.at(-1).text += token;
      continue;
    }
    const close = /^<\/([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*>$/u.exec(token);
    if (close) {
      if (stack.pop()?.qualified !== close[1]) refuse();
      continue;
    }
    const open =
      /^<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)((?:\s+xmlns(?::[A-Za-z_][\w.-]*)?="[^"<>]*")*)\s*(\/?)>$/u.exec(
        token,
      );
    if (!open || ++count > 4096 || stack.length >= 12) refuse();
    const namespaces = new Map(stack.at(-1)?.namespaces);
    const declared = new Set();
    for (const match of open[2].matchAll(/\s+xmlns(?::([A-Za-z_][\w.-]*))?="([^"<>]*)"/gu)) {
      const prefix = match[1] ?? '';
      if (declared.has(prefix) || ['xml', 'xmlns'].includes(prefix) || !match[2]) refuse();
      declared.add(prefix);
      namespaces.set(prefix, match[2]);
    }
    const parts = open[1].split(':');
    const prefix = parts.length === 2 ? parts[0] : '';
    const namespace = namespaces.get(prefix);
    if (!namespace) refuse();
    const node = {
      qualified: open[1],
      name: parts.at(-1),
      namespace,
      namespaces,
      children: [],
      text: '',
    };
    if (stack.length > 0) stack.at(-1).children.push(node);
    else {
      if (root) refuse();
      root = node;
    }
    if (!open[3]) stack.push(node);
  }
  if (!root || stack.length > 0) refuse();
  return root;
}

/**
 * Bind exact element name, namespace and ordered child names.
 * @param {object} node Parsed element.
 * @param {string} name Expected local name.
 * @param {string[]} names Exact ordered child names.
 * @param {string} namespace Expected namespace.
 * @returns {object[]} Bound children.
 */
function children(node, name, names, namespace = metadata) {
  if (
    node?.name !== name ||
    node.namespace !== namespace ||
    node.text.trim() ||
    node.children.length !== names.length
  )
    refuse();
  for (const [index, child] of node.children.entries()) {
    if (child.name !== names[index] || child.namespace !== (namespace === soap ? soap : metadata))
      refuse();
  }
  return node.children;
}

/**
 * Require a scalar metadata element without nested content.
 * @param {object} node Element.
 * @returns {string} Exact scalar text.
 */
function scalar(node) {
  if (!node || node.namespace !== metadata || node.children.length > 0) refuse();
  return node.text;
}

/**
 * Bind a SOAP envelope and its single metadata operation.
 * @param {string} xml Actual bytes decoded as strict UTF-8 by caller.
 * @param {boolean} request Whether exactly one SessionHeader is mandatory.
 * @returns {object} The single body operation, never the session.
 */
function envelope(xml, request) {
  const root = document(xml, request ? 16_384 : 8_388_608);
  const names = request
    ? ['Header', 'Body']
    : root.children.length === 2
      ? ['Header', 'Body']
      : ['Body'];
  const elements = children(root, 'Envelope', names, soap);
  if (names[0] === 'Header') {
    const header = elements[0];
    if (request) {
      if (header.text.trim() || header.children.length !== 1) refuse();
      const [session] = header.children;
      // SessionHeader inherits the metadata namespace, not the envelope namespace.
      const [id] = children(session, 'SessionHeader', ['sessionId']);
      if (!/^[A-Za-z0-9!._~-]{1,8192}$/u.test(scalar(id))) refuse();
    } else if (header.children.length > 0 || header.text.trim()) refuse();
  }
  const body = elements.at(-1);
  if (body.text.trim() || body.children.length !== 1 || body.children[0].namespace !== metadata)
    refuse();
  return body.children[0];
}

/**
 * Derive the existing ledger's semantic request only from actual JSforce SOAP bytes.
 * A missing includeZip means true, as used by installed JSforce's retrieve locator.
 * @param {object} input Pinned acceptance profile.
 * @param {string} xml Actual request envelope including SessionHeader.
 * @param {Set<string>} activeJobs Parent-authoritative active jobs.
 * @returns {object} Detached semantic body, containing no authentication material.
 */
export function parseSegmentSoapRequest(input, xml, activeJobs = new Set()) {
  const profile = validateSegmentAcceptanceProfile(input);
  const operation = envelope(xml, true);
  const base = { namespace: metadata, operation: operation.name };
  switch (operation.name) {
    case 'readMetadata': {
      const [type, name] = children(operation, 'readMetadata', ['type', 'fullNames']);
      if (scalar(type) !== 'CustomObject' || scalar(name) !== profile.dmo) refuse();
      return Object.freeze({
        ...base,
        type: 'CustomObject',
        fullNames: Object.freeze([profile.dmo]),
      });
    }
    case 'retrieve': {
      const [request] = children(operation, 'retrieve', ['request']);
      const fields = request.children.map((node) => node.name);
      // Object insertion order varies between callers, but duplicates/extras never bind.
      if (
        fields.length !== 3 ||
        new Set(fields).size !== 3 ||
        !['apiVersion', 'singlePackage', 'unpackaged'].every((name) => fields.includes(name))
      )
        refuse();
      children(request, 'request', fields);
      const byName = Object.fromEntries(request.children.map((node) => [node.name, node]));
      if (
        scalar(byName.apiVersion) !== profile.apiVersion ||
        scalar(byName.singlePackage) !== 'true'
      )
        refuse();
      const packageNames = byName.unpackaged.children.map((node) => node.name);
      if (!['types,version', 'version,types'].includes(packageNames.join(','))) refuse();
      children(byName.unpackaged, 'unpackaged', packageNames);
      const type = byName.unpackaged.children.find((node) => node.name === 'types');
      const version = byName.unpackaged.children.find((node) => node.name === 'version');
      const typeNames = type.children.map((node) => node.name);
      if (!['members,name', 'name,members'].includes(typeNames.join(','))) refuse();
      children(type, 'types', typeNames);
      if (
        scalar(version) !== profile.apiVersion ||
        scalar(type.children.find((node) => node.name === 'name')) !== 'MarketSegmentDefinition' ||
        scalar(type.children.find((node) => node.name === 'members')) !== profile.segment
      )
        refuse();
      return Object.freeze({
        ...base,
        apiVersion: profile.apiVersion,
        singlePackage: true,
        types: Object.freeze([
          Object.freeze({
            name: 'MarketSegmentDefinition',
            members: Object.freeze([profile.segment]),
          }),
        ]),
      });
    }
    case 'checkRetrieveStatus': {
      const names = operation.children.map((node) => node.name);
      if (!['asyncProcessId', 'asyncProcessId,includeZip'].includes(names.join(','))) refuse();
      const [id, zip] = children(operation, 'checkRetrieveStatus', names);
      const jobId = scalar(id);
      if (!jobPattern.test(jobId) || !(activeJobs instanceof Set) || !activeJobs.has(jobId))
        refuse();
      const value = zip ? scalar(zip) : 'true';
      if (!['true', 'false'].includes(value)) refuse();
      const includeZip = value === 'true';
      return Object.freeze({
        ...base,
        operation: includeZip ? 'retrieveResult' : 'checkRetrieveStatus',
        jobId,
        includeZip,
      });
    }
    default: {
      return refuse();
    }
  }
}

/**
 * Bind one raw retrieve/status response and reject unknown or duplicate result fields.
 * @param {string} xml Raw response body.
 * @param {string} operation Expected SOAP response operation.
 * @returns {Map<string, object[]>} Validated result fields.
 */
function resultFields(xml, operation) {
  const response = envelope(xml, false);
  const [result] = children(response, `${operation}Response`, ['result']);
  if (result.text.trim()) refuse();
  const fields = new Map();
  const repeated = new Set(['fileProperties', 'messages']);
  const allowed = new Set([
    'id',
    'done',
    'state',
    'status',
    'success',
    'errorMessage',
    'errorStatusCode',
    'zipFile',
    ...repeated,
  ]);
  for (const node of result.children) {
    if (
      node.namespace !== metadata ||
      !allowed.has(node.name) ||
      (fields.has(node.name) && !repeated.has(node.name))
    )
      refuse();
    fields.set(node.name, [...(fields.get(node.name) ?? []), node]);
    if (repeated.has(node.name)) {
      const known =
        node.name === 'messages'
          ? ['fileName', 'problem']
          : [
              'createdById',
              'createdByName',
              'createdDate',
              'fileName',
              'fullName',
              'id',
              'lastModifiedById',
              'lastModifiedByName',
              'lastModifiedDate',
              'manageableState',
              'namespacePrefix',
              'type',
            ];
      const names = node.children.map((child) => child.name);
      if (new Set(names).size !== names.length || names.some((name) => !known.includes(name)))
        refuse();
      children(node, node.name, names);
      for (const child of node.children) scalar(child);
    } else scalar(node);
  }
  if (!jobPattern.test(field(fields, 'id'))) refuse();
  return fields;
}

/**
 * Read a unique optional result scalar.
 * @param {Map<string, object[]>} fields Bound result fields.
 * @param {string} name Field name.
 * @returns {string | undefined} Scalar or absent.
 */
function field(fields, name) {
  const node = fields.get(name)?.[0];
  return node ? scalar(node) : undefined;
}

/**
 * Extract a raw retrieve response identity for parent-ledger registration.
 * @param {object} input Pinned profile.
 * @param {string} xml Actual response envelope, not JSforce's parsed result.
 * @param {object} context Parent request identity and all previously seen jobs.
 * @param {string} context.operationId Pending retrieve logical-read ID.
 * @param {Set<string>} context.seenJobs All run jobs, including closed jobs.
 * @returns {object} Exact registerMetadataJob argument; does not register by itself.
 */
export function parseSegmentRetrieveResponse(input, xml, { operationId, seenJobs } = {}) {
  const profile = validateSegmentAcceptanceProfile(input);
  if (
    typeof operationId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,100}$/u.test(operationId) ||
    !(seenJobs instanceof Set)
  )
    refuse();
  const fields = resultFields(xml, 'retrieve');
  const jobId = field(fields, 'id');
  const done = field(fields, 'done');
  const state = field(fields, 'state') ?? field(fields, 'status');
  if (
    seenJobs.has(jobId) ||
    done !== 'false' ||
    !['Queued', 'InProgress', 'Pending'].includes(state) ||
    fields.has('zipFile') ||
    fields.has('errorMessage') ||
    fields.has('errorStatusCode') ||
    fields.has('success') ||
    fields.has('fileProperties') ||
    fields.has('messages') ||
    (fields.has('state') && fields.has('status'))
  )
    refuse();
  return Object.freeze({
    operationId,
    jobId,
    orgId: profile.orgId,
    apiVersion: profile.apiVersion,
  });
}

/**
 * Interpret raw status evidence without prematurely closing a pending include-ZIP poll.
 * Parent must charge before wire dispatch and separately settle every pending logical read.
 * @param {object} input Pinned profile.
 * @param {string} xml Actual raw SOAP status response.
 * @param {object} request Previously parsed/admitted semantic request.
 * @returns {object} Redacted completion evidence; closeJob only after successful complete ZIP result.
 */
export function parseSegmentRetrieveStatusResponse(input, xml, request) {
  validateSegmentAcceptanceProfile(input);
  if (
    !request ||
    request.namespace !== metadata ||
    !jobPattern.test(request.jobId) ||
    !['checkRetrieveStatus', 'retrieveResult'].includes(request.operation) ||
    request.includeZip !== (request.operation === 'retrieveResult')
  )
    refuse();
  const fields = resultFields(xml, 'checkRetrieveStatus');
  const jobId = field(fields, 'id');
  const done = field(fields, 'done');
  const success = field(fields, 'success');
  const status = field(fields, 'status');
  const zip = field(fields, 'zipFile');
  if (jobId !== request.jobId || !['true', 'false'].includes(done) || fields.has('state')) refuse();
  const complete = done === 'true';
  const failed = ['Failed', 'Canceled'].includes(status);
  if (
    (!complete && !['Pending', 'Queued', 'InProgress'].includes(status)) ||
    (complete && !['Succeeded', 'Failed', 'Canceled'].includes(status)) ||
    (success !== undefined && !['true', 'false'].includes(success)) ||
    (success === 'true' && (!complete || failed)) ||
    (complete && !failed && success !== 'true')
  )
    refuse();
  const zipPresent = typeof zip === 'string' && zip.length > 0;
  if (
    zipPresent &&
    (!complete ||
      failed ||
      !request.includeZip ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(zip))
  )
    refuse();
  if (complete && !failed && request.includeZip && !zipPresent) refuse();
  const outcome =
    failed || fields.has('errorMessage') || fields.has('errorStatusCode') || fields.has('messages')
      ? 'failure'
      : 'success';
  return Object.freeze({
    jobId,
    includeZip: request.includeZip,
    done: complete,
    outcome,
    zipPresent,
    closeJob: outcome === 'success' && complete && request.includeZip,
  });
}
