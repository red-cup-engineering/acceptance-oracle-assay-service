import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import {createHash} from 'node:crypto';
import {assayAcceptanceOracle as assay} from '../src/assay.mjs';

const digest = text => 'sha256:' + createHash('sha256').update(text).digest('hex');
const entry = (path,text) => ({path, digest:digest(text), bytes:Buffer.byteLength(text), text});
function fixture(){
  const output='not ok addition-vector';
  return {
    manifest:{testVectors:[{id:'addition-vector'}], sourceEvidence:[entry('calc.mjs','export const add = (a,b) => a-b')]},
    oracle:{artifacts:[entry('acceptance/add.test.mjs',"test('addition-vector',()=>false)")],redWitness:{passed:false,output,outputDigest:digest(output),executedVectorIds:['addition-vector']}}
  };
}

test('original positive source, artifact, vector and red witness remain accepted',()=>{
  const r=assay(fixture());
  assert.equal(r.accepted,true);
  assert.deepEqual(r.failures,[]);
  assert.equal(r.redWitness.failedAsRequired,true);
});

test('valid Unicode source bytes are measured, not JavaScript code units',()=>{
  const f=fixture(); f.manifest.sourceEvidence=[entry('unicode.txt','éx')];
  const r=assay(f); assert.equal(r.accepted,true); assert.equal(r.sourceEvidence[0].bytes,3);
});

test('absent red execution coverage refuses without erasing the source inputs',()=>{
  const f=fixture(); f.oracle.redWitness.executedVectorIds=[];
  const r=assay(f); assert.equal(r.accepted,false); assert.ok(r.failures.includes('red-execution-vector-coverage-mismatch'));
});

test('accessor-backed red passed cannot yield acceptance inconsistent with returned witness',()=>{
  const f=fixture(); let calls=0;
  Object.defineProperty(f.oracle.redWitness,'passed',{enumerable:true,get(){calls++; return calls===1?false:true;}});
  const r=assay(f); assert.equal(calls,0,'do not invoke caller-supplied getter');
  assert.equal(r.accepted,false); assert.equal(r.redWitness.failedAsRequired,false);
});

test('source list with overridden map cannot erase measured source evidence',()=>{
  const f=fixture(); let invoked=0;
  Object.defineProperty(f.manifest.sourceEvidence,'map',{value(){invoked++;return [];}});
  const r=assay(f); assert.equal(invoked,0); assert.equal(r.accepted,false);
  assert.ok(r.failures.includes('source-evidence-absent'));
});

test('test-vector list with overridden map cannot forge coverage',()=>{
  const f=fixture(); let invoked=0;
  Object.defineProperty(f.manifest.testVectors,'map',{value(){invoked++;return ['addition-vector'];}});
  const r=assay(f); assert.equal(invoked,0); assert.equal(r.accepted,false);
  assert.ok(r.failures.includes('test-vectors-absent'));
});

test('receipt output accessor refuses without executing a callback',()=>{
  const f=fixture(); let calls=0;
  Object.defineProperty(f.oracle.redWitness,'output',{enumerable:true,get(){calls++;return 'not ok addition-vector';}});
  const r=assay(f); assert.equal(calls,0); assert.equal(r.accepted,false);
  assert.ok(r.failures.includes('red-execution-output-absent'));
});

test('artifact path accessor refuses without execution',()=>{
  const f=fixture(); let calls=0;
  Object.defineProperty(f.oracle.artifacts[0],'path',{enumerable:true,get(){calls++;return 'acceptance/add.test.mjs';}});
  const r=assay(f); assert.equal(calls,0); assert.equal(r.accepted,false);
  assert.ok(r.failures.includes('oracle-artifact-1-path'));
});

test('caller mutations after receiving cannot change earlier accepted receipt',()=>{
  const f=fixture(); const r=assay(f); assert.equal(r.accepted,true);
  f.manifest.testVectors[0].id='forged-vector';
  f.oracle.redWitness.executedVectorIds[0]='forged-vector';
  assert.deepEqual(r.testVectorIds,['addition-vector']);
  assert.deepEqual(r.redWitness.executedVectorIds,['addition-vector']);
});

test('sparse and decorated evidence lists refuse without executing iterators',()=>{
  const f=fixture(); let calls=0;
  f.manifest.sourceEvidence=new Array(1); f.manifest.sourceEvidence[0]=entry('a','b');
  Object.defineProperty(f.manifest.sourceEvidence,Symbol.iterator,{value(){calls++;return [][Symbol.iterator]();}});
  const r=assay(f); assert.equal(calls,0); assert.equal(r.accepted,false);
  assert.ok(r.failures.includes('source-evidence-absent'));
  const sparse=fixture(); sparse.oracle.artifacts=new Array(2); sparse.oracle.artifacts[0]=entry('a','b');
  const rs=assay(sparse); assert.equal(rs.accepted,false);
  assert.ok(rs.failures.includes('oracle-artifact-absent'));
});

test('inherited source coordinate does not impersonate an own evidence field',()=>{
  const f=fixture(); f.manifest.sourceEvidence[0]=Object.create({path:'calc.mjs',digest:digest('abc'),bytes:3});
  const r=assay(f); assert.equal(r.accepted,false);
  assert.ok(r.failures.includes('source-evidence-1-path'));
});

test('null-prototype inert JSON records remain valid',()=>{
  const f=fixture();
  f.manifest=Object.assign(Object.create(null),f.manifest);
  f.oracle=Object.assign(Object.create(null),f.oracle);
  f.oracle.redWitness=Object.assign(Object.create(null),f.oracle.redWitness);
  const r=assay(f); assert.equal(r.accepted,true);
});

test('top-level accessor cannot supply mutable manifest/oracle revisions',()=>{
  const f=fixture(); let calls=0;
  Object.defineProperty(f,'manifest',{enumerable:true,get(){calls++;return fixture().manifest;}});
  const r=assay(f); assert.equal(calls,0); assert.equal(r.accepted,false);
});

test('the original provider unit, server and full-test file paths resolve in this source revision', () => {
  // The actual installed WorkingDirectory is a separate Operations receipt.
  // This gate proves only that the original source package contains the paths
  // used by its declared launcher, dispatch and native integration test.
  const unitPath = new URL('../data/records/systemd/acceptance-oracle-assay-service.service', import.meta.url);
  assert.equal(existsSync(unitPath), true, 'one original systemd source record must exist');
  const unit = readFileSync(unitPath, 'utf8');
  const start = unit.match(/^ExecStart=(.+)$/mu)?.[1];
  assert.ok(start, 'the declared service has an ExecStart');
  assert.match(start, /\s+scripts\/server\.mjs$/u, 'systemd launches the actual source script, not a legacy bin path');
  assert.equal(existsSync(new URL('../scripts/server.mjs', import.meta.url)), true);
  const server = readFileSync(new URL('../scripts/server.mjs', import.meta.url), 'utf8');
  assert.match(server, /executorArgs:\s*\[resolve\(["']scripts\/execute-a2a-task\.mjs["']\)\]/u,
    'the actual server dispatches its existing source-owned executor');
  assert.equal(existsSync(new URL('../scripts/execute-a2a-task.mjs', import.meta.url)), true);
  const fullTest = readFileSync(new URL('./assay.test.mjs', import.meta.url), 'utf8');
  assert.ok(fullTest.includes('../data/records/systemd/acceptance-oracle-assay-service.service'),
    'the full native test must read the canonical unit source rather than a missing ops path');
});
