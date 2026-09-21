import {FRAME,syntheticBoreholes,validateBoreholes,validateParameters} from './engine.mjs';
/** Explicit import contract; never feeds unvalidated stored JSON into WebGL or the solver. */
export function restoreGroundPayload(payload){
 if(!payload||payload.kind!=='ground-model'||payload.frame?.id!==FRAME.id||payload.frame?.unit!=='m')throw new Error('같은 m 단위 현장 프레임의 지반 검토 기록이 필요합니다.');
 const errors=validateBoreholes(payload.holes);if(errors.length)throw new Error(errors.join(' '));
 if(payload.holes.some(h=>h.easting<0||h.easting>120||h.northing<0||h.northing>100))throw new Error('시추 좌표가 이 현장의 120×100 m 범위를 벗어납니다.');
 const pe=validateParameters(payload.parameters??{});if(pe.length)throw new Error(pe.join(' '));
 const bounded=(v,min,max,label)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`${label} 값을 확인하세요.`);return v;};
 const sectionNorth=bounded(payload.sectionNorth,0,100,'단면 위치'),depth=bounded(payload.excavation?.depth,0,15,'굴착 깊이');
 const r=payload.registration;if(!r||typeof r.applied!=='boolean')throw new Error('저장된 정합 적용 상태를 확인하세요.');
 const transform={east:bounded(r.east,-30,30,'동쪽 이동'),north:bounded(r.north,-30,30,'북쪽 이동'),rotation:bounded(r.rotation,-30,30,'회전'),scale:bounded(r.scale,.5,1.5,'축척'),height:bounded(r.height,-10,10,'높이 오프셋')};
 const view=payload.view??{},holes=structuredClone(payload.holes);
 const selected=holes.some(h=>h.id===view.selected)?view.selected:holes[0].id;
 const syntheticMatch=holes.length===syntheticBoreholes.length&&holes.every((h,i)=>{const expected=syntheticBoreholes[i];return h.id===expected.id&&['easting','northing','collar','totalDepth'].every(k=>Math.abs(h[k]-expected[k])<1e-9)&&h.layers.every((l,j)=>Math.abs(l.from-expected.layers[j].from)<1e-9&&Math.abs(l.to-expected.layers[j].to)<1e-9);});
 return {holes,parameters:{model:payload.parameters.model,range:String(payload.parameters.range),sill:String(payload.parameters.sill),nugget:String(payload.parameters.nugget)},sectionNorth,depth,transform,transformed:r.applied,selected,layers:Array.isArray(view.layers)&&view.layers.length===4&&view.layers.every(v=>typeof v==='boolean')?view.layers:[true,true,true,true],showHoles:typeof view.showHoles==='boolean'?view.showHoles:true,showVariance:typeof view.showVariance==='boolean'?view.showVariance:false,verticalScale:[1,1.5,2].includes(view.verticalScale)?view.verticalScale:1.5,datasetOrigin:payload.datasetOrigin==='synthetic'&&syntheticMatch?'synthetic':'user-provided'};
}
