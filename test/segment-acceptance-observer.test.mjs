import '../scripts/check-temporary.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildSegmentAcceptanceArgv,
  createSegmentAcceptance,
} from '../scripts/segment-acceptance-controls.mjs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createSegmentAcceptanceBroker,
  segmentBrokerCall,
} from '../scripts/segment-acceptance-observer.mjs';

const observer = fileURLToPath(
  new URL('../scripts/segment-acceptance-observer.mjs', import.meta.url),
);
const profile = {
  executable: process.execPath,
  cliEntry: observer,
  launcherEntry: observer,
  importOrigin: observer,
  cwd: process.cwd(),
  orgId: '00D000000000001AAA',
  targetOrg: 'synthetic',
  origin: 'https://source.example',
  apiVersion: '65.0',
  segment: 'Selected',
  dmo: 'Profile__dlm',
  field: 'Id__c',
};
const create = async () => {
  const ledger = createSegmentAcceptance(profile);
  ledger.beginPhase(
    'baseline',
    { orgProcesses: 2, metadataJobs: 1, logicalReads: 4, milliseconds: 300_000 },
    { orgProcesses: 2, metadataJobs: 1, logicalReads: 4, milliseconds: 300_000 },
  );
  return createSegmentAcceptanceBroker({ ledger, profile });
};

test('pipe broker owns the ledger and charges each poll before returning permission', async () => {
  const broker = await create();
  try {
    const call = (action, payload) => segmentBrokerCall(broker, action, payload);
    assert.deepEqual(await call('hello', false), profile);
    const base = {
      method: 'POST',
      url: `${profile.origin}/services/Soap/m/65.0/${profile.orgId}`,
      orgId: profile.orgId,
      apiVersion: '65.0',
      redirect: 'error',
    };
    const namespace = 'http://soap.sforce.com/2006/04/metadata';
    await call('read', {
      ...base,
      id: 'retrieve',
      body: {
        namespace,
        operation: 'retrieve',
        apiVersion: '65.0',
        singlePackage: true,
        types: [{ name: 'MarketSegmentDefinition', members: ['Selected'] }],
      },
    });
    await call('job', {
      operationId: 'retrieve',
      jobId: '09S000000000001AAA',
      orgId: profile.orgId,
      apiVersion: '65.0',
    });
    await call('read', {
      ...base,
      id: 'poll',
      body: {
        namespace,
        operation: 'checkRetrieveStatus',
        jobId: '09S000000000001AAA',
        includeZip: false,
      },
    });
    assert.equal(broker.audit().used.logicalReads, 2);
    await call('result', { id: 'poll', outcome: 'success' });
    await assert.rejects(
      call('read', {
        ...base,
        id: 'poll',
        body: {
          namespace,
          operation: 'checkRetrieveStatus',
          jobId: '09S000000000001AAA',
          includeZip: false,
        },
      }),
    );
    assert.ok(broker.audit().stopped);
  } finally {
    await broker.close();
  }
});

for (const failure of ['wrong-job', 'contradiction', 'http', 'replay', 'semantic-bypass']) {
  test(`raw broker ${failure} retains charge and stops`, async () => {
    const broker = await create();
    try {
      const require = createRequire(import.meta.url);
      const { SOAP } = require('@jsforce/jsforce-node/lib/soap.js');
      const { Connection } = require('@jsforce/jsforce-node');
      const serializer = new SOAP(
        new Connection({
          accessToken: 'SYNTHETIC_NOT_AUTH!session',
          instanceUrl: profile.origin,
          version: '65.0',
        }),
        { xmlns: 'http://soap.sforce.com/2006/04/metadata', endpointUrl: profile.origin },
      );
      const job = '09S000000000001AAA';
      const wrap = (operation, fields) =>
        `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${operation}Response xmlns="http://soap.sforce.com/2006/04/metadata"><result>${fields}</result></${operation}Response></s:Body></s:Envelope>`;
      const identity = wrap('retrieve', `<done>false</done><id>${job}</id><state>Queued</state>`);
      const request = {
        id: 'raw',
        method: 'POST',
        url: `${profile.origin}/services/Soap/m/65.0/${profile.orgId}`,
        body: serializer._createEnvelope({
          retrieve: {
            request: {
              apiVersion: '65.0',
              singlePackage: true,
              unpackaged: {
                types: { members: profile.segment, name: 'MarketSegmentDefinition' },
                version: '65.0',
              },
            },
          },
        }),
      };
      await segmentBrokerCall(broker, 'wire-read', request);
      if (failure === 'semantic-bypass') {
        await assert.rejects(
          segmentBrokerCall(broker, 'job', {
            operationId: 'raw',
            jobId: job,
            orgId: profile.orgId,
            apiVersion: '65.0',
          }),
        );
      } else if (failure === 'http') {
        await assert.rejects(
          segmentBrokerCall(broker, 'wire-result', { id: 'raw', statusCode: 302, body: identity }),
        );
      } else {
        await segmentBrokerCall(broker, 'wire-result', {
          id: 'raw',
          statusCode: 200,
          body: identity,
        });
        if (failure === 'replay')
          await assert.rejects(
            segmentBrokerCall(broker, 'wire-result', {
              id: 'raw',
              statusCode: 200,
              body: identity,
            }),
          );
        else {
          await segmentBrokerCall(broker, 'wire-read', {
            ...request,
            id: 'poll',
            body: serializer._createEnvelope({ checkRetrieveStatus: { asyncProcessId: job } }),
          });
          const body = wrap(
            'checkRetrieveStatus',
            `<id>${failure === 'wrong-job' ? '09S000000000002AAA' : job}</id><done>false</done><status>${failure === 'contradiction' ? 'Succeeded' : 'InProgress'}</status><success>false</success>`,
          );
          await assert.rejects(
            segmentBrokerCall(broker, 'wire-result', { id: 'poll', statusCode: 200, body }),
          );
        }
      }
      assert.ok(broker.audit().stopped);
      assert.equal(broker.audit().used.metadataJobs, 1);
      assert.equal(
        broker.audit().used.logicalReads,
        ['wrong-job', 'contradiction'].includes(failure) ? 2 : 1,
      );
    } finally {
      await broker.close();
    }
  });
}

test('parent creates retained registered scratch instead of accepting caller paths', async () => {
  const broker = await create();
  try {
    const root = await segmentBrokerCall(broker, 'scratch', 'data360-metadata-');
    assert.match(root, /^F:\\Temp\\data360-metadata-/iu);
    assert.deepEqual(broker.registeredScratch(), [root]);
    await assert.rejects(segmentBrokerCall(broker, 'scratch', { root }));
  } finally {
    await broker.close();
  }
});

test('scratch process admission precharges exact execFile bytes and rejects marker tamper', async () => {
  const selected = { ...profile };
  const ledger = createSegmentAcceptance(selected);
  const cost = { orgProcesses: 2, metadataJobs: 1, logicalReads: 4, milliseconds: 600_000 };
  ledger.beginPhase('baseline', cost, cost);
  let stops = 0;
  const broker = await createSegmentAcceptanceBroker({
    ledger,
    profile: selected,
    onStop: () => {
      stops++;
    },
  });
  try {
    const cwd = await segmentBrokerCall(broker, 'scratch', 'data360-metadata-');
    const descriptor = {
      id: 'child',
      executable: process.execPath,
      argv: buildSegmentAcceptanceArgv(selected, 'metadata-retrieve'),
      cwd,
    };
    await segmentBrokerCall(broker, 'process', descriptor);
    assert.equal(ledger.audit().used.orgProcesses, 1);
    await segmentBrokerCall(broker, 'result', { id: 'child', outcome: 'success' });
    await writeFile(`${cwd}/.segment-acceptance-owner`, 'tampered');
    await assert.rejects(segmentBrokerCall(broker, 'process', { ...descriptor, id: 'other' }));
    assert.equal(ledger.audit().used.orgProcesses, 1);
    assert.equal(stops, 1);
  } finally {
    await broker.close();
  }
});

for (const change of ['argv', 'cwd', 'semantics']) {
  test(`parent refuses child ${change} before process debit`, async () => {
    const broker = await create();
    try {
      const cwd = await segmentBrokerCall(broker, 'scratch', 'data360-metadata-');
      const descriptor = {
        id: 'denied',
        executable: process.execPath,
        argv: buildSegmentAcceptanceArgv(profile, 'metadata-retrieve'),
        cwd,
      };
      if (change === 'argv') descriptor.argv.push('--help');
      if (change === 'cwd') descriptor.cwd = profile.cwd;
      if (change === 'semantics') descriptor.operation = 'metadata-retrieve';
      await assert.rejects(segmentBrokerCall(broker, 'process', descriptor));
      assert.equal(broker.audit().used.orgProcesses, 0);
      assert.ok(broker.audit().stopped);
    } finally {
      await broker.close();
    }
  });
}

test('broker rejects unknown credentials without dispatching', async () => {
  const broker = await create();
  try {
    await assert.rejects(segmentBrokerCall({ ...broker, token: 'wrong' }, 'hello', false));
    assert.equal(broker.audit().used.logicalReads, 0);
    assert.ok(broker.audit().stopped);
  } finally {
    await broker.close();
  }
});

test('real execFile returns ChildProcess immediately and child inherits the private broker', async () => {
  const ledger = createSegmentAcceptance(profile);
  const cost = { orgProcesses: 2, metadataJobs: 1, logicalReads: 4, milliseconds: 600_000 };
  ledger.beginPhase('baseline', cost, cost);
  const broker = await createSegmentAcceptanceBroker({ ledger, profile });
  try {
    const code = `
      const assert=(await import('node:assert/strict')).default;
      const fs=await import('node:fs/promises');
      const os=await import('node:os'); const path=await import('node:path');
      const cp=await import('node:child_process');
      const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'data360-metadata-'));
      await new Promise((resolve,reject)=>{
        const child=cp.execFile(process.execPath,${JSON.stringify(buildSegmentAcceptanceArgv(profile, 'metadata-retrieve'))},
          {cwd,timeout:330000,maxBuffer:4194304,windowsHide:true,env:{...process.env,
            SF_AUTOUPDATE_DISABLE:'true',SF_DISABLE_TELEMETRY:'true',SF_DISABLE_SOURCE_MEMBER_POLLING:'true'}},
          (error,stdout,stderr)=>{ if(error) reject(error); else {
            assert.equal(stdout,''); assert.equal(stderr,''); resolve();
          }});
        assert.ok(child instanceof cp.ChildProcess);
        assert.ok(child.stdout); assert.equal(typeof child.on,'function');
      });
    `;
    const result = await new Promise((resolve, rejectChild) => {
      const child = spawn(
        process.execPath,
        ['--import', pathToFileURL(observer).href, '--input-type=module', '-e', code],
        {
          env: {
            ...process.env,
            SEGMENT_ACCEPTANCE_PRELOAD: JSON.stringify({
              endpoint: broker.endpoint,
              token: broker.token,
            }),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.once('error', rejectChild);
      child.once('close', (code) => resolve({ code, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(ledger.audit().used.orgProcesses, 1);
    assert.deepEqual(ledger.audit().pending, []);
    assert.equal(ledger.audit().stopped, undefined);
  } finally {
    await broker.close();
  }
});

test('SYNTHETIC captured transport retains StreamPromise and settles raw omitted-ZIP polls', async () => {
  const broker = await create();
  try {
    const code = `
      const assert=(await import('node:assert/strict')).default;
      const {createRequire}=await import('node:module');
      const {installSegmentAcceptancePreload,segmentBrokerCall}=await import(${JSON.stringify(pathToFileURL(observer).href)});
      const require=createRequire(${JSON.stringify(observer)});
      const {SOAP}=require('@jsforce/jsforce-node/lib/soap.js');
      const {Connection}=require('@jsforce/jsforce-node');
      const {StreamPromise}=require('@jsforce/jsforce-node/lib/util/promise.js');
      const config=${JSON.stringify({ endpoint: broker.endpoint, token: broker.token })};
      const profile=${JSON.stringify(profile)};
      const job='09S000000000001AAA'; let dispatched=0;
      const wrap=(operation,fields)=>'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><'+operation+'Response xmlns="http://soap.sforce.com/2006/04/metadata"><result>'+fields+'</result></'+operation+'Response></s:Body></s:Envelope>';
      const replies=[wrap('retrieve','<done>false</done><id>'+job+'</id><state>Queued</state>'),
        ...[0,1].map(()=>wrap('checkRetrieveStatus','<id>'+job+'</id><done>false</done><status>InProgress</status><success>false</success>')),
        wrap('checkRetrieveStatus','<id>'+job+'</id><done>true</done><status>Succeeded</status><success>true</success><zipFile>UEs=</zipFile>')];
      await installSegmentAcceptancePreload(config,{syntheticTransport:async(input,admission)=>{
        assert.equal(input.method,'POST');
        // Parent receipt proves debit and prior completion state before captured dispatch.
        assert.equal(admission.used.logicalReads,dispatched+1);
        assert.deepEqual(admission.activeJobs,dispatched===0?[]:[job]);
        return {statusCode:200,headers:{},body:replies[dispatched++]};
      }});
      const serializer=new SOAP(new Connection({accessToken:'SYNTHETIC_NOT_AUTH!session',instanceUrl:profile.origin,version:'65.0'}),{xmlns:'http://soap.sforce.com/2006/04/metadata',endpointUrl:profile.origin+'/services/Soap/m/65.0'});
      const {Transport}=require('@jsforce/jsforce-node/lib/transport.js');
      const messages=[{retrieve:{request:{apiVersion:'65.0',singlePackage:true,unpackaged:{types:{members:'Selected',name:'MarketSegmentDefinition'},version:'65.0'}}}},
        ...[0,1,2].map(()=>({checkRetrieveStatus:{asyncProcessId:job}}))];
      for(const message of messages){
        const result=new Transport().httpRequest({method:'POST',url:profile.origin+'/services/Soap/m/65.0/'+profile.orgId,body:serializer._createEnvelope(message)});
        assert.ok(result instanceof StreamPromise); assert.equal(typeof result.stream,'function');
        let received=''; result.stream().on('data',chunk=>{received+=chunk});
        const response=await result; assert.equal(received,response.body);
        console.log('SETTLED:'+dispatched);
      }
      assert.equal(dispatched,4);
    `;
    const result = await new Promise((resolve, rejectChild) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
        env: { ...process.env, SEGMENT_ACCEPTANCE_PRELOAD: '' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.once('error', rejectChild);
      child.once('close', (exitCode) => resolve({ exitCode, stdout, stderr }));
    });
    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stdout, /SETTLED:4/u);
    assert.deepEqual(broker.audit().used, { orgProcesses: 0, metadataJobs: 1, logicalReads: 4 });
    assert.deepEqual(broker.audit().activeJobs, []);
    assert.deepEqual(broker.audit().seenJobs, ['09S000000000001AAA']);
    assert.deepEqual(broker.audit().pending, []);
    assert.equal(broker.audit().stopped, undefined);
  } finally {
    await broker.close();
  }
});

test('exported low-level spawn refuses stripped-preload executable before launch and debit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'segment-low-level-'));
  const marker = path.join(root, 'unauthorized-launch');
  const broker = await create();
  try {
    const code = `
      const assert = (await import('node:assert/strict')).default;
      const {ChildProcess} = await import('node:child_process');
      const environment = Object.entries(process.env).filter(([key]) =>
        !['NODE_OPTIONS','SEGMENT_ACCEPTANCE_PRELOAD'].includes(key.toUpperCase())
      ).map(([key,value]) => key+'='+value);
      const child = new ChildProcess();
      child.on('error',()=>{});
      assert.throws(()=>child.spawn({
        file:process.execPath,
        args:[process.execPath,'-e',${JSON.stringify(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'launched')`)}],
        cwd:${JSON.stringify(root)}, envPairs:environment,
        stdio:[{type:'ignore'},{type:'ignore'},{type:'ignore'}],
        windowsHide:true, windowsVerbatimArguments:false, detached:false
      }), /SEGMENT_ACCEPTANCE: unobserved boundary refused/);
      assert.equal(child.pid,undefined);
      console.log('LOW_LEVEL_REFUSED_BEFORE_LAUNCH');
    `;
    const output = await new Promise((resolve, rejectChild) => {
      const child = spawn(
        process.execPath,
        ['--import', pathToFileURL(observer).href, '--input-type=module', '-e', code],
        {
          env: {
            ...process.env,
            SEGMENT_ACCEPTANCE_PRELOAD: JSON.stringify({
              endpoint: broker.endpoint,
              token: broker.token,
            }),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.once('error', rejectChild);
      child.once('close', (exitCode, signal) => resolve({ exitCode, signal, stdout, stderr }));
    });
    assert.match(output.stdout, /LOW_LEVEL_REFUSED_BEFORE_LAUNCH/u);
    assert.ok([0, 1].includes(output.exitCode), output.stderr);
    assert.ok(!output.signal);
    await assert.rejects(readFile(marker), { code: 'ENOENT' });
    assert.deepEqual(broker.audit().used, { orgProcesses: 0, metadataJobs: 0, logicalReads: 0 });
    assert.ok(broker.audit().stopped);
    await assert.rejects(segmentBrokerCall(broker, 'state', false));
  } finally {
    await broker.close();
  }
});

for (const route of ['fetch', 'http', 'undici', 'process', 'worker', 'transport']) {
  test(`actual preload refuses ${route} bypass without a network connection`, async () => {
    const broker = await create();
    try {
      const code = `
        const {createRequire}=await import('node:module');
        const require=createRequire(${JSON.stringify(observer)});
        let refused=false;
        try {
          const route=${JSON.stringify(route)};
          if(route==='fetch') await fetch('https://source.example');
          if(route==='http') (await import('node:https')).request('https://source.example');
          if(route==='undici') await require('undici').fetch('https://source.example');
          if(route==='process') (await import('node:child_process')).spawn(process.execPath,[]);
          if(route==='worker') new (await import('node:worker_threads')).Worker('setInterval(()=>{},1000)',{eval:true});
          if(route==='transport') {
            const {Transport}=require('@jsforce/jsforce-node/lib/transport.js');
            const response=new Transport().httpRequest({method:'GET',url:'https://source.example/not-allowed'});
            if(typeof response.stream!=='function') throw new Error('missing StreamPromise');
            await response;
          }
        } catch(error) { refused=[error,error.cause,error.cause?.cause].some(value=>String(value).includes('SEGMENT_ACCEPTANCE:')); }
        if(!refused) process.exitCode=2;
        else console.log('BOUNDARY_REFUSED');
      `;
      const output = await new Promise((resolve, rejectChild) => {
        const child = spawn(
          process.execPath,
          ['--import', pathToFileURL(observer).href, '--input-type=module', '-e', code],
          {
            env: {
              ...process.env,
              SEGMENT_ACCEPTANCE_PRELOAD: JSON.stringify({
                endpoint: broker.endpoint,
                token: broker.token,
              }),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 15_000,
          },
        );
        let stdout = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        let stderr = '';
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.once('error', rejectChild);
        child.once('close', (exitCode, signal) => resolve({ exitCode, signal, stderr, stdout }));
      });
      if (route === 'transport') assert.equal(output.exitCode, 1, output.stderr);
      else {
        assert.match(output.stdout, /BOUNDARY_REFUSED/u);
        assert.ok([0, 1].includes(output.exitCode), output.stderr);
      }
      assert.ok(broker.audit().stopped);
      assert.ok(!output.signal);
      assert.equal(broker.audit().used.logicalReads, 0);
    } finally {
      await broker.close();
    }
  });
}
