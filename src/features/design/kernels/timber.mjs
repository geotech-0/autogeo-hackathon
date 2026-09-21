// Pure calculation core adapted from the existing member engines.
// Project presets, document identifiers, and report serializers are intentionally excluded.
import {FIELDS,calculate as bending} from './timber-base.mjs';
const MODULE={fields:[...FIELDS,{key:'allowableShearMpa',min:.01,max:100}]};
export function calculate(raw){
 const base=bending(raw),field=MODULE.fields.at(-1),x=raw?.allowableShearMpa;
 const numeric=typeof x==='number'||typeof x==='string'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(x.trim());
 const shearAllow=numeric?Number(x):NaN;
 const errors=base.ok?{}:{...base.errors};
 if(!Number.isFinite(shearAllow)||shearAllow<field.min||shearAllow>field.max)errors.allowableShearMpa='허용전단응력에 0.01~100 MPa의 수치를 입력하세요.';
 if(Object.keys(errors).length)return {ok:false,errors};
 const i={...base.input,allowableShearMpa:shearAllow},r={...base.results};delete r.withinBendingLimit;
 r.shearKn=r.lineLoadKnm*(r.spanMm/1000)/2;r.areaMm2=i.heightMm*i.thicknessMm;r.averageShearMpa=r.shearKn*1000/r.areaMm2;r.maximumShearMpa=1.5*r.averageShearMpa;r.shearRequiredThicknessMm=1.5*r.shearKn*1000/(i.heightMm*shearAllow);r.requiredBothMm=Math.max(r.requiredThicknessMm,r.shearRequiredThicknessMm);
 const checks=[{key:'bending',label:'휨응력',value:r.stressMpa,limit:i.allowableMpa,unit:'MPa',relation:'<='},{key:'averageShear',label:'평균전단 · 채택식',value:r.averageShearMpa,limit:shearAllow,unit:'MPa',relation:'<='},{key:'maximumShear',label:'최대전단 · 직사각형 보완',value:r.maximumShearMpa,limit:shearAllow,unit:'MPa',relation:'<='}].map(c=>({...c,pass:c.value<=c.limit}));
 const step=(key,title,formula,substitution,unit)=>({key,title,formula,substitution,value:r[key],unit});
 const steps=[step('spanMm','설계지간','L=s−3b/4',`${i.spacingMm} − 3 × ${i.pileWidthMm} / 4`,'mm'),step('lineLoadKnm','선하중','w=pH/1000',`${i.pressureKpa} × ${i.heightMm} / 1000`,'kN/m'),step('momentKnm','최대 휨모멘트','M=w(L/1000)²/8',`${r.lineLoadKnm} × (${r.spanMm}/1000)² / 8`,'kN·m'),step('shearKn','최대 전단력','V=w(L/1000)/2',`${r.lineLoadKnm} × (${r.spanMm}/1000) / 2`,'kN'),step('sectionModulusMm3','단면계수','Z=Ht²/6',`${i.heightMm} × ${i.thicknessMm}² / 6`,'mm³'),step('stressMpa','휨응력','fb=M×10⁶/Z',`${r.momentKnm} × 10⁶ / ${r.sectionModulusMm3}`,'MPa'),step('averageShearMpa','채택 평균전단','τavg=V×1000/(Ht)',`${r.shearKn} × 1000 / (${i.heightMm} × ${i.thicknessMm})`,'MPa'),step('maximumShearMpa','직사각형 최대전단','τmax=1.5τavg',`1.5 × ${r.averageShearMpa}`,'MPa'),step('requiredThicknessMm','휨 소요두께','t_req=√(6M×10⁶/(Hfba))',`√(6 × ${r.momentKnm} × 10⁶ / (${i.heightMm} × ${i.allowableMpa}))`,'mm'),step('shearRequiredThicknessMm','최대전단 소요두께','t_s=1.5V×1000/(Hτa)',`1.5 × ${r.shearKn} × 1000 / (${i.heightMm} × ${shearAllow})`,'mm'),step('requiredBothMm','휨·최대전단 소요두께','max(t_req,t_s)',`max(${r.requiredThicknessMm},${r.shearRequiredThicknessMm})`,'mm')];
 return {ok:true,input:i,results:r,checks,steps,warnings:['최대전단 보완값은 채택의 평균전단과 별도 결과입니다. 휨·전단 소요두께는 처짐·접촉·연결부 검토를 포함한 최종 채택두께가 아닙니다.']};
}
