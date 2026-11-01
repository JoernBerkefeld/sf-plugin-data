import './check-temporary.mjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import { PassThrough } from 'node:stream';
import fsPromises, { mkdtemp, writeFile, lstat, realpath } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { validateSegmentAcceptanceProfile } from './segment-acceptance-controls.mjs';
import {
  parseSegmentSoapRequest,
  parseSegmentRetrieveResponse,
  parseSegmentRetrieveStatusResponse,
} from './segment-acceptance-soap.mjs';

const reject = () => {
  throw new Error('SEGMENT_ACCEPTANCE: unobserved boundary refused');
};
const exactWire = (value, keys) => {
  if (!value || Object.keys(value).toSorted().join(',') !== keys.toSorted().join(',')) reject();
};
const normalized = (value) =>
  path
    .resolve(value)
    .replace(/[\\/]+$/u, '')
    .toLowerCase();

/**
 * Verify an existing newly-created scratch root without following ancestor links.
 * @param {string} root Exact root returned by this run's intercepted mkdtemp.
 * @returns {Promise<void>} Resolves only for a real OS-temp child.
 */
async function inspectScratch(root) {
  if (!path.isAbsolute(root) || normalized(path.dirname(root)) !== normalized(os.tmpdir()))
    reject();
  let current = root;
  for (;;) {
    const stat = await lstat(current);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      normalized(await realpath(current)) !== normalized(current)
    )
      reject();
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

/**
 * Snapshot both installed module origins before any child may launch.
 * @param {object} profile Pinned parent selection.
 * @returns {object[]} Exact module paths, versions and byte hashes.
 */
function transportBindings(profile) {
  return [profile.importOrigin, profile.cliEntry].map((origin) => {
    const require = createRequire(origin);
    const files = ['transport.js', 'util/promise.js', 'http-api.js'].map((name) =>
      require.resolve(`@jsforce/jsforce-node/lib/${name}`),
    );
    const packagePath = path.join(path.dirname(files[0]), '..', 'package.json');
    return {
      origin,
      executable: profile.executable,
      executableVersion: process.version,
      executableHash: createHash('sha256')
        .update(fs.readFileSync(profile.executable))
        .digest('hex'),
      version: JSON.parse(fs.readFileSync(packagePath, 'utf8')).version,
      files: [...files, packagePath].map((file) => ({
        file,
        hash: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      })),
    };
  });
}

/**
 * Expose one authoritative ledger through a bounded authenticated local pipe.
 * Tokens are coordination credentials, not a same-user malicious-code sandbox.
 * @param {object} options Parent-owned inputs.
 * @param {object} options.ledger Already-started authoritative ledger.
 * @param {object} options.profile Immutable selection.
 * @param {Function} options.onStop Parent-owned Job cancellation callback.
 * @returns {Promise<object>} Pipe endpoint, audit and explicit close boundary.
 */
export async function createSegmentAcceptanceBroker({ ledger, profile, onStop = () => {} }) {
  profile = validateSegmentAcceptanceProfile(profile);
  const token = randomBytes(32).toString('hex');
  const endpoint = String.raw`\\.\pipe\segment-acceptance-${randomUUID()}`;
  const sockets = new Set();
  const scratch = new Map();
  const watchers = new Set();
  const wirePending = new Map();
  const bindings = transportBindings(profile);
  let cancelled = false;
  const fail = () => {
    ledger.stop('observer protocol refused');
    if (!cancelled) {
      cancelled = true;
      for (const watcher of watchers) watcher.destroy();
      onStop();
    }
  };
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket);
    let buffer = '';
    let busy = false;
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', fail);
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 16_800_000 || busy || !buffer.endsWith('\n')) {
        if (buffer.length > 16_800_000 || busy) {
          fail();
          socket.destroy();
        }
        return;
      }
      busy = true;
      void (async () => {
        let response;
        try {
          const message = JSON.parse(buffer);
          if (
            message.token !== token ||
            Object.keys(message).toSorted().join(',') !== 'action,payload,token'
          )
            reject();
          const { action, payload } = message;
          if (ledger.audit().stopped && action !== 'stop') reject();
          switch (action) {
            case 'watch': {
              if (payload !== false) reject();
              watchers.add(socket);
              socket.once('close', () => watchers.delete(socket));
              return;
            }
            case 'hello': {
              if (payload !== false) reject();
              response = profile;
              break;
            }
            case 'bindings': {
              if (payload !== false) reject();
              response = bindings;
              break;
            }
            case 'state': {
              if (payload !== false || ledger.audit().stopped) reject();
              response = true;
              break;
            }
            case 'process': {
              // Derive semantics from the actual executable, argv and options, never a caller label.
              if (Object.keys(payload).toSorted().join(',') !== 'argv,cwd,executable,id') reject();
              if (JSON.stringify(transportBindings(profile)) !== JSON.stringify(bindings)) reject();
              const marker = scratch.get(payload.cwd);
              if (!marker) reject();
              await inspectScratch(payload.cwd);
              const markerPath = path.join(payload.cwd, '.segment-acceptance-owner');
              const stat = await lstat(markerPath);
              if (
                !stat.isFile() ||
                stat.isSymbolicLink() ||
                (await fsPromises.readFile(markerPath, 'utf8')) !== marker
              )
                reject();
              response = ledger.dispatchProcess({
                ...payload,
                operation: 'metadata-retrieve',
                importOrigin: profile.importOrigin,
                api: 'execFile',
                shell: false,
                timeoutMs: 330_000,
              });
              break;
            }
            case 'wire-read': {
              exactWire(payload, ['id', 'method', 'url', 'body']);
              const body =
                payload.method === 'POST'
                  ? parseSegmentSoapRequest(
                      profile,
                      payload.body,
                      new Set(ledger.audit().activeJobs),
                    )
                  : undefined;
              if (payload.method === 'GET' && payload.body !== false) reject();
              response = ledger.dispatchRead({
                ...payload,
                body,
                orgId: profile.orgId,
                apiVersion: '65.0',
                redirect: 'error',
              });
              wirePending.set(payload.id, body);
              break;
            }
            case 'wire-result': {
              exactWire(payload, ['id', 'statusCode', 'body']);
              if (!wirePending.has(payload.id)) reject();
              const body = wirePending.get(payload.id);
              if (
                !Number.isInteger(payload.statusCode) ||
                payload.statusCode < 200 ||
                payload.statusCode >= 300 ||
                typeof payload.body !== 'string'
              )
                reject();
              if (body?.operation === 'retrieve') {
                response = ledger.registerMetadataJob(
                  parseSegmentRetrieveResponse(profile, payload.body, {
                    operationId: payload.id,
                    seenJobs: new Set(ledger.audit().seenJobs),
                  }),
                );
              } else if (['checkRetrieveStatus', 'retrieveResult'].includes(body?.operation)) {
                const completion = parseSegmentRetrieveStatusResponse(profile, payload.body, body);
                response = ledger.observeResult({
                  id: payload.id,
                  outcome: completion.outcome,
                  completion,
                });
              } else response = ledger.observeResult({ id: payload.id, outcome: 'success' });
              wirePending.delete(payload.id);
              break;
            }
            case 'read': {
              response = ledger.dispatchRead({ ...payload, body: payload.body ?? undefined });
              break;
            }
            case 'result': {
              // Raw-wire attempts cannot bypass response parsing through the semantic receipt seam.
              if (wirePending.has(payload.id) && payload.outcome === 'success') reject();
              response = ledger.observeResult(payload);
              break;
            }
            case 'job': {
              if (wirePending.has(payload.operationId)) reject();
              response = ledger.registerMetadataJob(payload);
              break;
            }
            case 'stop': {
              fail();
              response = ledger.audit();
              break;
            }
            case 'scratch': {
              // Only the parent creates and registers roots; a child cannot claim an existing path.
              if (payload !== 'data360-metadata-') reject();
              const root = await mkdtemp(path.join(os.tmpdir(), payload));
              const marker = randomBytes(32).toString('hex');
              await inspectScratch(root);
              await writeFile(path.join(root, '.segment-acceptance-owner'), marker, { flag: 'wx' });
              ledger.registerScratch(root);
              scratch.set(root, marker);
              response = root;
              break;
            }
            default: {
              reject();
            }
          }
          socket.end(JSON.stringify({ ok: true, value: response }) + '\n');
        } catch {
          fail();
          socket.end('{"ok":false}\n');
        }
      })();
    });
  });
  await new Promise((resolve, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(endpoint, resolve);
  });
  const deadlineWatch = setInterval(() => {
    if (ledger.audit().stopped) fail();
  }, 100);
  deadlineWatch.unref();
  return Object.freeze({
    endpoint,
    token,
    audit: () => ledger.audit(),
    registeredScratch: () => Object.freeze([...scratch.keys()]),
    close: async () => {
      clearInterval(deadlineWatch);
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolve())),
      );
    },
  });
}

/**
 * Send exactly one broker transaction; no timeout/reconnect/retry or replay.
 * @param {object} config Private local pipe coordinates.
 * @param {string} action One broker action.
 * @param {unknown} payload Action arguments.
 * @returns {Promise<unknown>} Parent receipt.
 */
export function segmentBrokerCall(config, action, payload) {
  return new Promise((resolve, rejectCall) => {
    const socket = net.createConnection(config.endpoint);
    let bytes = '';
    socket.setTimeout(5000, () => socket.destroy(new Error('Observer broker timeout')));
    socket.once('connect', () =>
      socket.write(JSON.stringify({ token: config.token, action, payload }) + '\n'),
    );
    socket.on('data', (chunk) => {
      bytes += chunk.toString();
      if (bytes.length > 65_536) socket.destroy(new Error('Observer broker overflow'));
    });
    socket.once('error', rejectCall);
    socket.once('end', () => {
      try {
        const result = JSON.parse(bytes);
        if (result.ok !== true) reject();
        resolve(result.value);
      } catch (error) {
        rejectCall(error);
      }
    });
  });
}

/**
 * Install an actual preload boundary before any application imports execute.
 * Unknown process and transport boundaries remain fail-closed.
 * @param {object} config Private broker endpoint and token.
 * @param {object} root0 Private synthetic test options.
 * @param {Function} root0.syntheticTransport Captured dispatch replacement for synthetic profiles only.
 * @returns {Promise<void>} Installed fail-closed boundary.
 */
export async function installSegmentAcceptancePreload(config, { syntheticTransport } = {}) {
  const profile = await segmentBrokerCall(config, 'hello', false);
  // Private test-only captured dispatch replacement: all guards and parent accounting remain active.
  if (
    syntheticTransport !== undefined &&
    (typeof syntheticTransport !== 'function' ||
      profile.targetOrg !== 'synthetic' ||
      profile.origin !== 'https://source.example')
  )
    reject();
  const context = new AsyncLocalStorage();
  const connect = net.Socket.prototype.connect;
  const request = https.request;
  const brokerCall = (action, payload) =>
    context.run('broker', () => segmentBrokerCall(config, action, payload));
  const refuse = () => {
    void brokerCall('stop', false).catch(() => {});
    reject();
  };
  net.Socket.prototype.connect = function (...arguments_) {
    if (context.getStore() !== 'broker' && context.getStore() !== 'transport') refuse();
    return Reflect.apply(connect, this, arguments_);
  };
  // Capture the only approved HTTPS entry, then close all public bypass APIs.
  for (const module of [http, https]) for (const name of ['request', 'get']) module[name] = refuse;
  globalThis.fetch = refuse;
  const tlsConnect = tls.connect;
  tls.connect = function (...arguments_) {
    if (context.getStore() !== 'transport') refuse();
    return Reflect.apply(tlsConnect, this, arguments_);
  };
  const spawn = childProcess.spawn;
  const lowLevelSpawn = childProcess.ChildProcess.prototype.spawn;
  let admittedSpawn = false;
  childProcess.ChildProcess.prototype.spawn = function (...arguments_) {
    if (!admittedSpawn) refuse();
    // Consume the synchronous permission before entering native code; public callers never get it.
    admittedSpawn = false;
    return Reflect.apply(lowLevelSpawn, this, arguments_);
  };
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFileSync', 'fork'])
    childProcess[name] = refuse;
  const privateConfig = JSON.stringify({ endpoint: config.endpoint, token: config.token });
  const preload = `--import=${pathToFileURL(fileURLToPath(import.meta.url)).href}`;
  childProcess.execFile = (executable, argv, options, callback) => {
    if (
      typeof callback !== 'function' ||
      !Array.isArray(argv) ||
      !options ||
      Object.keys(options).toSorted().join(',') !== 'cwd,env,maxBuffer,timeout,windowsHide' ||
      options.timeout !== 330_000 ||
      options.maxBuffer !== 4_194_304 ||
      options.windowsHide !== true ||
      !options.env ||
      ['SF_AUTOUPDATE_DISABLE', 'SF_DISABLE_TELEMETRY', 'SF_DISABLE_SOURCE_MEMBER_POLLING'].some(
        (key) => options.env[key] !== 'true',
      ) ||
      Object.keys(process.env).some(
        (key) =>
          ![
            'SF_AUTOUPDATE_DISABLE',
            'SF_DISABLE_TELEMETRY',
            'SF_DISABLE_SOURCE_MEMBER_POLLING',
          ].includes(key) && options.env[key] !== process.env[key],
      ) ||
      Object.keys(options.env).some(
        (key) =>
          !(key in process.env) &&
          ![
            'SF_AUTOUPDATE_DISABLE',
            'SF_DISABLE_TELEMETRY',
            'SF_DISABLE_SOURCE_MEMBER_POLLING',
          ].includes(key),
      ) ||
      (process.env.NODE_OPTIONS && process.env.NODE_OPTIONS !== preload)
    )
      refuse();
    const id = randomUUID();
    const descriptor = { id, executable, argv: [...argv], cwd: options.cwd };
    const launchOptions = {
      ...options,
      env: { ...options.env, NODE_OPTIONS: preload, SEGMENT_ACCEPTANCE_PRELOAD: privateConfig },
    };
    // Return an actual ChildProcess immediately; admission is asynchronous and precedes spawn.
    const child = new childProcess.ChildProcess();
    child.on('error', () => {});
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = refuse; // Cancellation belongs exclusively to the parent's owned Job handle.
    child.send = refuse;
    child.spawn = refuse;
    void brokerCall('process', descriptor)
      .then(
        () => {
          let actual;
          admittedSpawn = true;
          try {
            actual = spawn(executable, descriptor.argv, {
              cwd: launchOptions.cwd,
              env: launchOptions.env,
              // The owned helper hides the shared console; libuv hiding creates extra console hosts.
              windowsHide: false,
              stdio: ['pipe', 'pipe', 'pipe'],
              shell: false,
            });
          } finally {
            admittedSpawn = false;
          }
          const output = { stdout: [], stderr: [] };
          const sizes = { stdout: 0, stderr: 0 };
          for (const key of ['stdout', 'stderr'])
            actual[key].on('data', (chunk) => {
              sizes[key] += chunk.length;
              if (sizes[key] > 4_194_304) void brokerCall('stop', false).catch(() => {});
              else output[key].push(chunk);
            });
          let launchError;
          actual.once('error', (error) => {
            launchError = error;
          });
          actual.once('close', (code, signal) => {
            const error =
              launchError ??
              (code === 0 && !signal
                ? undefined
                : Object.assign(new Error('SEGMENT_ACCEPTANCE: child failed'), { code, signal }));
            const stdout = Buffer.concat(output.stdout).toString('utf8');
            const stderr = Buffer.concat(output.stderr).toString('utf8');
            void brokerCall('result', { id, outcome: error ? 'failure' : 'success' }).then(
              () => callback(error, stdout, stderr),
              (error_) => callback(error ?? error_, stdout, stderr),
            );
          });
          child.pid = actual.pid;
          child.spawnfile = actual.spawnfile;
          child.spawnargs = actual.spawnargs;
          child.stdin.pipe(actual.stdin);
          // Callback-only callers need not consume the returned streams; bounded capture must still drain.
          for (const key of ['stdout', 'stderr']) {
            actual[key].on('data', (chunk) => {
              if (sizes[key] <= 4_194_304) child[key].write(chunk);
            });
            actual[key].once('end', () => child[key].end());
          }
          actual.on('spawn', () => child.emit('spawn'));
          actual.on('error', (error) => child.emit('error', error));
          actual.on('exit', (code, signal) => {
            child.exitCode = code;
            child.signalCode = signal;
            child.emit('exit', code, signal);
          });
          actual.on('close', (code, signal) => child.emit('close', code, signal));
        },
        (error) => {
          child.stdin.end();
          child.stdout.end();
          child.stderr.end();
          callback(error, '', '');
          child.emit('close');
        },
      )
      .catch(() => {
        void brokerCall('stop', false).catch(() => {});
      });
    return child;
  };
  // One persistent cancellation channel: no overlapping poll storm during module hashing.
  const watch = context.run('broker', () => net.createConnection(config.endpoint));
  watch.once('connect', () => {
    watch.write(JSON.stringify({ token: config.token, action: 'watch', payload: false }) + '\n');
    watch.unref();
  });
  watch.once('error', () => process.exit(1));
  watch.once('end', () => process.exit(1));
  watch.once('close', () => process.exit(1));
  workerThreads.Worker = class {
    constructor() {
      refuse();
    }
  };
  fsPromises.mkdtemp = async (prefix, options) => {
    if (prefix !== path.join(os.tmpdir(), 'data360-metadata-') || options !== undefined) refuse();
    return brokerCall('scratch', 'data360-metadata-');
  };
  fs.mkdtemp = refuse;
  fs.mkdtempSync = refuse;
  syncBuiltinESMExports();
  const bindings = await brokerCall('bindings', false);
  const patched = new Set();
  for (const binding of bindings) {
    if (
      binding.executable !== process.execPath ||
      binding.executableVersion !== process.version ||
      binding.executableHash !==
        createHash('sha256').update(fs.readFileSync(process.execPath)).digest('hex') ||
      ![profile.importOrigin, profile.cliEntry].includes(binding.origin)
    )
      refuse();
    const require = createRequire(binding.origin);
    const expected = ['transport.js', 'util/promise.js', 'http-api.js'].map((name) =>
      require.resolve(`@jsforce/jsforce-node/lib/${name}`),
    );
    expected.push(path.join(path.dirname(expected[0]), '..', 'package.json'));
    if (
      binding.files.length !== expected.length ||
      binding.files.some(
        ({ file, hash }, index) =>
          file !== expected[index] ||
          createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== hash,
      ) ||
      JSON.parse(fs.readFileSync(expected[3], 'utf8')).version !== binding.version
    )
      refuse();
    const transportPath = expected[0];
    if (patched.has(transportPath)) continue;
    patched.add(transportPath);
    const { Transport } = require(transportPath);
    const { StreamPromise } = require(require.resolve('@jsforce/jsforce-node/lib/util/promise.js'));
    const { HttpApi } = require(require.resolve('@jsforce/jsforce-node/lib/http-api.js'));
    // Refresh delegates can replay requests below the semantic API; never permit them.
    HttpApi.prototype.getRefreshDelegate = () => {};
    Transport.prototype.httpRequest = function (input, options = {}) {
      // Detach wire bytes before the asynchronous authorization round-trip.
      input = structuredClone(input);
      if (
        !['GET', 'POST'].includes(input.method) ||
        Object.keys(input).some(
          (key) => !['method', 'url', 'headers', 'body', '_message'].includes(key),
        ) ||
        (input.method === 'GET' && input.body !== undefined) ||
        (input.method === 'POST' && typeof input.body !== 'string') ||
        Object.keys(input.headers ?? {}).some(
          (key) =>
            ![
              'authorization',
              'content-type',
              'content-length',
              'soapaction',
              'sforce-call-options',
              'user-agent',
              'accept',
            ].includes(key.toLowerCase()),
        )
      )
        refuse();
      const stream = new PassThrough();
      // The public stream is output-only: bodies must already be exact strings.
      stream.on('error', () => {});
      const promise = (async () => {
        if (
          Object.keys(options).some(
            (key) => !['responseType', 'noContentResponse', 'timeout'].includes(key),
          )
        )
          refuse();
        const id = randomUUID();
        const admission = await brokerCall('wire-read', {
          id,
          method: input.method,
          url: input.url,
          body: input.body ?? false,
        });
        try {
          const response = syntheticTransport
            ? await syntheticTransport(input, admission)
            : await context.run(
                'transport',
                () =>
                  new Promise((resolve, rejectRequest) => {
                    const target = new URL(input.url);
                    const outgoing = request(
                      target,
                      {
                        method: input.method,
                        headers: input.headers,
                        agent: false,
                        timeout: 30_000,
                      },
                      (incoming) => {
                        const chunks = [];
                        let size = 0;
                        incoming.on('data', (chunk) => {
                          size += chunk.length;
                          if (size > 8_388_608)
                            incoming.destroy(new Error('Observer response overflow'));
                          else chunks.push(chunk);
                        });
                        incoming.once('error', rejectRequest);
                        incoming.once('end', () =>
                          resolve({
                            statusCode: incoming.statusCode,
                            headers: incoming.headers,
                            body: Buffer.concat(chunks).toString('utf8'),
                          }),
                        );
                      },
                    );
                    outgoing.once('error', rejectRequest);
                    outgoing.once('timeout', () =>
                      outgoing.destroy(new Error('Observer request timeout')),
                    );
                    outgoing.end(input.body);
                  }),
              );
          await brokerCall('wire-result', {
            id,
            statusCode: response.statusCode,
            body: response.body,
          });
          stream.end(response.body);
          return response;
        } catch (error) {
          await brokerCall('result', { id, outcome: 'uncertain' }).catch(() => {});
          stream.destroy(error);
          throw error;
        }
      })();
      return StreamPromise.create(() => ({ stream, promise }));
    };
  }
}

if (process.env.SEGMENT_ACCEPTANCE_PRELOAD) {
  await installSegmentAcceptancePreload(JSON.parse(process.env.SEGMENT_ACCEPTANCE_PRELOAD));
}
