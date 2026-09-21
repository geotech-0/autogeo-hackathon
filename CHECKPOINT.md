# AutoGeo 실행 상태

- 시작: 2026-09-21 17:24 KST. 업데이트: 17:49 KST, 경과 약 25분.
- 목표: P0 구현·실제 수치/브라우저/공개배포 검증·발표/제출 산출물. 10시간은 상한 계획이며 인위적으로 기다리지 않는다.
- 마지막 공개 commit: `387aa2b` (초기 공통 화면만). https://github.com/geotech-0/autogeo-hackathon
- 초기 Production: https://autogeo-hackathon.vercel.app/ (초기 화면 배포 확인, **아직 전체 기능 최종본 아님**).
- 로컬: `npm run dev -- --port 4173`, exec 54010. React/Vite/TypeScript, IndexedDB schema 2.

## 완료

- 네 업무 기능 통합 및 TypeScript production build.
- 설계 앵커→Treq→손실포함 Jf→띠장, H-Pile Qu/Fs, 토류판 면압 입력.
- ordinary kriging 12공·3D·단면·정합, 평판재하/계측/영상비교, GPR 조치이력.
- 공통 저장·개정이력·동시 저장·원자적 JSON import 검증. 최신 통합 61개 시험 통과(추가 시험 진행 중).
- 원문 엔진 관련 137시험 현재 실행, 실제 계산서20사례 회귀 20/20. 원문 자료는 공개 repo 밖 work에만 보관.
- 실제 NH14 전사/검수, 지반모델 독립 수치대조, 드론/CAD 개략정합 로컬 결과 확보.

## 진행/남은 일

- 비작성자 브라우저 검수, 1440/1024/390 통합 QA. 오래 열려 있던 v1 DB 탭 upgrade 대기 복구 확인.
- 최종 공개 소스/자산 허용목록, Preview→Production 실제 전체 기능 배포.
- 새 브라우저·공개 URL·깊은 경로·자산·계산/저장·성능·clean clone 재현.
- TEST_REPORT, VISUAL_QA, DATA_SOURCES, README, 발표5페이지/대본/최종제출 설명.
- 영상/로그 외부 업로드와 행사 최종 제출은 사람이 수행할 항목으로 남긴다.

## 파일 담당

- root: App/styles/contracts/storage/shared/components/package/config/docs/deploy/submission
- reference_audit: src/features/design/**, work/design/**; 시공/GPR 독립검수
- past_projects: src/features/ground/**, work/ground/**; 실제 주상도/정합
- scope_feasibility: src/features/field/**, src/features/maintenance/**, work/field/**

## 다음 실행

`npm test` / `npm run build` (관련 변경 후)
공개 전 `git diff` 및 허용목록 검사. 로컬 실제 원본을 public/src에 넣지 않는다.
