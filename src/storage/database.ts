import type { ProjectRecord, ProjectRecordDraft } from '../contracts';
import { SITE } from '../contracts';
import { validateArchive, makeRecord } from './validation.mjs';
const DB_NAME = 'autogeo-project-v1';
let connection: Promise<IDBDatabase> | undefined;
export function getDatabase(): Promise<IDBDatabase> {
 if (!connection) connection = new Promise<IDBDatabase>((resolve,reject)=>{
  if (!globalThis.indexedDB) {reject(new Error('이 브라우저에서 저장소를 사용할 수 없습니다. 다른 브라우저로 열어주세요.'));return;}
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('records',{keyPath:'id'});db.createObjectStore('drafts');db.createObjectStore('meta');};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('브라우저 저장소를 열지 못했습니다. 저장 권한을 확인해주세요.'));
  request.onblocked=()=>reject(new Error('다른 AutoGeo 탭을 닫은 후 다시 시도해주세요.'));
 }).catch(error=>{connection=undefined;throw error;});
 return connection!;
}
export async function listRecords():Promise<ProjectRecord[]> {
 const db=await getDatabase();return new Promise((resolve,reject)=>{const q=db.transaction('records','readonly').objectStore('records').getAll();q.onsuccess=()=>resolve((q.result as ProjectRecord[]).filter(r=>r.site_id===SITE.id).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)));q.onerror=()=>reject(q.error);});
}
export async function saveRecord(draft:ProjectRecordDraft):Promise<ProjectRecord>{
 const db=await getDatabase();const existing=draft.id?(await listRecords()).find(r=>r.id===draft.id):undefined;
 const record=makeRecord(draft,existing) as ProjectRecord;
 return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(record);tx.oncomplete=()=>resolve(record);tx.onerror=()=>reject(new Error('저장하지 못했습니다. 저장 공간을 확인하고 다시 시도해주세요.'));});
}
export async function initializeRecords(seeds:ProjectRecordDraft[]):Promise<void>{
 const db=await getDatabase();const initialized=await new Promise((resolve,reject)=>{const q=db.transaction('meta').objectStore('meta').get('initialized');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 if(initialized)return;
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['records','meta'],'readwrite');seeds.forEach(d=>tx.objectStore('records').put(makeRecord(d)));tx.objectStore('meta').put(true,'initialized');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export async function resetProject(seeds:ProjectRecordDraft[]):Promise<void>{
 const db=await getDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['records','drafts','meta'],'readwrite');tx.objectStore('records').clear();tx.objectStore('drafts').clear();seeds.forEach(d=>tx.objectStore('records').put(makeRecord(d)));tx.objectStore('meta').put(true,'initialized');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export async function exportProject(){return {schema_version:1,site_id:SITE.id,exported_at:new Date().toISOString(),records:await listRecords()};}
export async function importProject(archive:unknown):Promise<number>{
 const clean=validateArchive(archive);const db=await getDatabase();
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite');clean.records.forEach((r:ProjectRecord)=>tx.objectStore('records').put(r));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});return clean.records.length;
}
export async function readDraft<T>(key:string):Promise<T|undefined>{const db=await getDatabase();return new Promise((resolve,reject)=>{const q=db.transaction('drafts').objectStore('drafts').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
export async function writeDraft(key:string,value:unknown):Promise<void>{const db=await getDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
