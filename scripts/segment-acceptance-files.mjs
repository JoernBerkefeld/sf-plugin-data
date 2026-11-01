import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const limit = 1_048_576;
const refuse = () => {
  throw new Error('SEGMENT_ACCEPTANCE: synthetic pair refused');
};
const decode = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
const same = (a, b) =>
  ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode', 'nlink'].every((key) => a[key] === b[key]);
const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

/**
 * Create an offline synthetic-only reader. Snapshot checks detect observed changes, not an
 * atomic path traversal or protection against an adversary that swaps and restores a path.
 * Windows is refused because Node does not expose the necessary reparse-point controls here.
 * @param {object} selection Fixed synthetic project and segment selection.
 * @param {string} selection.root Absolute project root.
 * @param {string} selection.segment Segment API name.
 * @returns {Function} Reader compatible with the coordinator's readPair seam.
 */
export function createPairReader({ root, segment }) {
  if (
    process.platform !== 'linux' ||
    !constants.O_NOFOLLOW ||
    !path.isAbsolute(root) ||
    path.normalize(root) !== root ||
    !/^[A-Za-z][A-Za-z0-9_]{0,199}$/u.test(segment)
  )
    refuse();
  return async function readPair({ phase, receipt, item }) {
    if (!['retrieve', 'repeat'].includes(phase)) refuse();
    const stdout = receipt?.evidence?.stdout;
    if (
      !(typeof stdout === 'string' || Buffer.isBuffer(stdout)) ||
      Buffer.byteLength(stdout) > limit
    )
      refuse();
    const envelope = JSON.parse(typeof stdout === 'string' ? stdout : decode(stdout));
    const items = envelope?.result?.result?.items;
    if (!Array.isArray(items) || items.length !== 1 || !isDeepStrictEqual(items[0], item)) refuse();
    if (
      item?.family !== 'segment' ||
      item.operation !== 'retrieve' ||
      item.identity?.apiName !== segment ||
      item.identity?.dataSpace !== 'default' ||
      !['retrieved', 'unchanged'].includes(item.outcome) ||
      (phase === 'repeat' && item.outcome !== 'unchanged')
    )
      refuse();
    const xmlPath = item.path;
    const jsonPath = item.companionPath;
    if (
      typeof xmlPath !== 'string' ||
      typeof jsonPath !== 'string' ||
      !path.isAbsolute(xmlPath) ||
      !path.isAbsolute(jsonPath) ||
      path.normalize(xmlPath) !== xmlPath ||
      path.normalize(jsonPath) !== jsonPath
    )
      refuse();
    const base = path.dirname(path.dirname(xmlPath));
    if (
      xmlPath !==
        path.join(
          base,
          'marketSegmentDefinitions',
          `${segment}.marketSegmentDefinition-meta.xml`,
        ) ||
      jsonPath !== path.join(base, 'data360', 'segments', `${segment}.segment.json`)
    )
      refuse();
    const relative = path.relative(root, xmlPath);
    if (
      !relative ||
      relative.startsWith(`..${path.sep}`) ||
      relative === '..' ||
      path.isAbsolute(relative)
    )
      refuse();
    const snapshots = new Map();
    /**
     *
     * @param {string} file Absolute selected path.
     */
    async function inspect(file) {
      const parts = file.slice(path.parse(file).root.length).split(path.sep);
      let current = path.parse(file).root;
      for (const part of ['', ...parts]) {
        if (part) current = path.join(current, part);
        const stat = await lstat(current, { bigint: true });
        const final = current === file;
        if (
          stat.isSymbolicLink() ||
          (final ? !stat.isFile() || stat.nlink !== 1n : !stat.isDirectory()) ||
          (await realpath(current)) !== current
        )
          refuse();
        const previous = snapshots.get(current);
        if (previous && !same(previous, stat)) refuse();
        snapshots.set(current, stat);
      }
    }
    const handles = [];
    try {
      await inspect(xmlPath);
      await inspect(jsonPath);
      for (const file of [xmlPath, jsonPath]) {
        const handle = await open(
          file,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        handles.push(handle);
        const stat = await handle.stat({ bigint: true });
        if (!stat.isFile() || stat.size > BigInt(limit) || !same(stat, snapshots.get(file)))
          refuse();
      }
      const bytes = [];
      for (const handle of handles) {
        const stat = await handle.stat({ bigint: true });
        const buffer = Buffer.alloc(Number(stat.size) + 1);
        let position = 0;
        while (position < buffer.length) {
          const result = await handle.read(buffer, position, buffer.length - position, position);
          if (!result.bytesRead) break;
          position += result.bytesRead;
        }
        if (position !== Number(stat.size) || !same(stat, await handle.stat({ bigint: true })))
          refuse();
        bytes.push(buffer.subarray(0, position));
      }
      for (const [index, file] of [xmlPath, jsonPath].entries()) {
        if (!same(snapshots.get(file), await handles[index].stat({ bigint: true }))) refuse();
        await inspect(file);
      }
      const xml = decode(bytes[0]);
      const json = JSON.parse(decode(bytes[1]));
      const model = json?.spec?.models;
      if (
        json?.kind !== 'segment' ||
        json?.identity?.apiName !== segment ||
        json?.identity?.dataSpace !== 'default' ||
        json?.spec?.segmentType !== 'DBT' ||
        typeof json.spec.displayName !== 'string' ||
        !Array.isArray(model) ||
        model.length !== 1 ||
        model[0]?.name !== segment ||
        typeof model[0]?.sql !== 'string'
      )
        refuse();
      const pipeline = `<DbtPipeline xmlns=""><models><model><name>${escapeXml(segment)}</name><sql>${escapeXml(model[0].sql)}</sql></model></models></DbtPipeline>`;
      const match =
        /^(?:<\?xml version="1\.0" encoding="UTF-8"\?>\s*)?<MarketSegmentDefinition xmlns="http:\/\/soap\.sforce\.com\/2006\/04\/metadata">\s*<includeCriteria>([^<]*)<\/includeCriteria>\s*<masterLabel>([^<]*)<\/masterLabel>\s*<segmentType>DBT<\/segmentType>\s*<\/MarketSegmentDefinition>\s*$/u.exec(
          xml,
        );
      if (
        !match ||
        match[1] !== escapeXml(pipeline) ||
        match[2] !== escapeXml(json.spec.displayName)
      )
        refuse();
      return { jsonBytes: bytes[1], xmlBytes: bytes[0] };
    } finally {
      await Promise.all(handles.map((handle) => handle.close()));
    }
  };
}
