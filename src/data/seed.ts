import type { ProjectRecordDraft } from '../contracts';
export const SEED_RECORDS:ProjectRecordDraft[] = [
 {id:'seed-ground-review',stage:'tender',title:'A-01 지층 모델 검토',status:'pending',summary:'합성 시추공 12개와 굴착영역을 확인하고 모델을 검토해주세요.',asset_id:'ground-a01',payload:{kind:'review',seed:true},assumptions:['합성 지층 예제','실측 조사 결과가 아님']},
 {id:'seed-field-alert',stage:'construction',title:'계측 관리기준 검토',status:'pending',summary:'계측 예제의 기준을 확인한 뒤 이상 여부를 검토해주세요.',asset_id:'monitor-a01',payload:{kind:'review',seed:true},assumptions:['합성 계측 예제','설정한 관리기준에 대한 검토']},
 {id:'seed-maintenance',stage:'maintenance',title:'GPR 해석결과 후속 확인',status:'pending',summary:'A-01 포장 하부 이상구역의 확인조사와 조치 계획을 기록해주세요.',asset_id:'pavement-a01',payload:{kind:'review',seed:true},assumptions:['합성 GPR 해석결과','자동 손상 진단이 아님']}
];
