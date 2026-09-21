const SITE='synthetic-a';
const stages=['tender','design','construction','maintenance'];
const statuses=['draft','pass','exceeded','pending','stale','action','closed','error'];
const origins=['synthetic','measured','imported_analysis','calculated'];
function finiteTree(value){if(typeof value==='number'&&!Number.isFinite(value))return false;if(Array.isArray(value))return value.every(finiteTree);if(value&&typeof value==='object')return Object.values(value).every(finiteTree);return true;}
function verify(record){
 if(!record||typeof record!=='object')throw new Error('기록 형식이 올바르지 않습니다.');
 for(const key of ['id','site_id','zone_id','source_id','source_revision','analysis_id','method_version','created_at','updated_at','title','summary'])if(typeof record[key]!=='string'||!record[key].trim())throw new Error(`${key}: 필수 정보가 없습니다.`);
 if(record.site_id!==SITE)throw new Error('다른 현장의 기록은 A현장에 가져올 수 없습니다.');
 if(!stages.includes(record.stage)||!statuses.includes(record.status)||!origins.includes(record.origin))throw new Error('기록의 업무·상태·출처가 올바르지 않습니다.');
 if(!Number.isInteger(record.revision)||record.revision<1)throw new Error('기록 개정이 올바르지 않습니다.');
 if(!Number.isFinite(Date.parse(record.created_at))||!Number.isFinite(Date.parse(record.updated_at)))throw new Error('기록 날짜가 올바르지 않습니다.');
 if(!Array.isArray(record.assumptions)||!record.assumptions.every(x=>typeof x==='string'))throw new Error('가정 목록이 올바르지 않습니다.');
 if(!record.payload||typeof record.payload!=='object'||Array.isArray(record.payload)||!finiteTree(record.payload))throw new Error('기록에 유효하지 않은 수치나 내용이 있습니다.');
 if(record.dependencies!==undefined&&(!Array.isArray(record.dependencies)||!record.dependencies.every(d=>d&&typeof d.analysis_id==='string'&&Number.isInteger(d.revision)&&d.revision>0)))throw new Error('연결된 계산 개정이 올바르지 않습니다.');
 return record;
}
export function makeRecord(draft,existing){
 const now=new Date().toISOString();const id=existing?.id||draft.id||crypto.randomUUID();
 const record={site_id:SITE,zone_id:'A-01',source_id:'synthetic-a-v1',source_revision:'1',method_version:'autogeo-1',origin:'synthetic',assumptions:['합성 A현장 시연 예제'],...draft,id,analysis_id:existing?.analysis_id||draft.analysis_id||id,created_at:existing?.created_at||draft.created_at||now,updated_at:now,revision:(existing?.revision||0)+1};
 return verify(record);
}
export function validateArchive(value){
 if(!value||typeof value!=='object'||value.schema_version!==1||value.site_id!==SITE||!Array.isArray(value.records))throw new Error('AutoGeo A현장의 지원되는 내보내기 파일이 아닙니다.');
 if(value.records.length>2000)throw new Error('한 번에 2,000개까지 가져올 수 있습니다.');
 const seen=new Set();for(const record of value.records){verify(record);if(seen.has(record.id))throw new Error('같은 ID의 기록이 중복되어 있습니다.');seen.add(record.id);}
 return structuredClone(value);
}
