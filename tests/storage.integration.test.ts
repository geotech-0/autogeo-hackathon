import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportProject, importProject, initializeRecords, listRecords, listRevisions, readDraft, resetProject, saveRecord, writeDraft } from '../src/storage/database';
import type { ProjectRecordDraft } from '../src/contracts';
const sample:ProjectRecordDraft={stage:'design',title:'연결 계산 검토',status:'pass',summary:'합성 독립 시험',payload:{R:40,Jf:105.3963},dependencies:[{analysis_id:'anchor-01',revision:1}]};
test('IndexedDB initializes only once without discarding a saved user record',async()=>{
 await resetProject([]);const user=await saveRecord(sample);await initializeRecords([{...sample,id:'sample-late-seed'}]);const records=await listRecords();assert.deepEqual(records.map(r=>r.id),[user.id]);
});
test('concurrent saves serialize revision changes and retain every prior input',async()=>{
 await resetProject([]);const first=await saveRecord(sample);
 const updates=await Promise.all([saveRecord({...sample,id:first.id,payload:{R:50}}),saveRecord({...sample,id:first.id,payload:{R:60}})]);
 assert.deepEqual(updates.map(r=>r.revision).sort(),[2,3]);const history=await listRevisions(first.id);assert.deepEqual(history.map(r=>r.revision),[3,2,1]);assert.equal(history[2].payload.R,40);assert.equal(history[0].payload.R,60);
});
test('JSON roundtrip restores current data and all revisions; older imports cannot roll back current data',async()=>{
 await resetProject([]);const r1=await saveRecord(sample);const old=JSON.parse(JSON.stringify(await exportProject()));await saveRecord({...sample,id:r1.id,status:'stale',payload:{R:80}});const full=JSON.parse(JSON.stringify(await exportProject()));
 await importProject(old);assert.equal((await listRecords())[0].revision,2);assert.equal((await listRecords())[0].payload.R,80);
 await resetProject([]);assert.equal(await importProject(full),1);assert.equal((await listRevisions(r1.id)).length,2);assert.equal((await listRecords())[0].status,'stale');
});
test('conflicting same revision aborts the entire import, including unrelated records',async()=>{
 await resetProject([]);const first=await saveRecord(sample);const before=JSON.parse(JSON.stringify(await exportProject()));const conflict={...first,payload:{R:999}};const unrelated={...first,id:'new-record',analysis_id:'new-analysis'};
 await assert.rejects(importProject({schema_version:1,site_id:'synthetic-a',records:[unrelated,conflict]}),/동일/);
 assert.deepEqual(JSON.parse(JSON.stringify(await exportProject())).records,before.records);assert.equal((await listRecords()).length,1);
});
test('missing provenance and other-site imports make no writes',async()=>{
 await resetProject([]);const first=await saveRecord(sample);for(const patch of [{source_id:''},{site_id:'other-site'}])await assert.rejects(importProject({schema_version:1,site_id:'synthetic-a',records:[{...first,...patch}]}));assert.equal((await listRecords()).length,1);
});
test('confirmed reset clears user records, drafts and archived revisions then adds only seeds',async()=>{
 await resetProject([]);const first=await saveRecord(sample);await saveRecord({...sample,id:first.id});await writeDraft('form',{value:123});assert.deepEqual(await readDraft('form'),{value:123});await resetProject([{...sample,id:'only-seed'}]);assert.deepEqual((await listRecords()).map(r=>r.id),['only-seed']);assert.equal(await readDraft('form'),undefined);assert.deepEqual(await listRevisions(first.id),[]);
});
