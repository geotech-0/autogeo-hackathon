# Decisions

## 현재 실자료 버전 — 2026-09-21 후속

- 기본 자료를 이천자이더리체 실제 32공·정사영상·설계·월간계측으로 전환했다. 기존 합성 현장 DB는 보존하고 별도 현장 ID와 저장소를 사용한다.
- 제공 원본 PDF 9개·주상도 이미지 47개·품질 원본 7개는 로컬에 보존하며 Git/공개 파생 빌드에서 제외한다. 실제 수치·좌표·영상·3D는 공개 후보에 포함한다.
- 공개 URL은 아직 이전 합성판이다. 실제 파생자료 공개범위를 확인한 뒤 GitHub/Vercel을 교체하고 공개 SHA를 검증한다.
- 실제 GPR·두 번째 드론 회차는 미제공이다. 미확인 원문값·단위는 보류하고 빈 자료를 합성 실측으로 채우지 않는다.
- 106개 자동시험과 실제 브라우저 교차 검수를 통과했다. 독립 계산 대조와 개정 복원, 첨부 포함 원자적 내보내기/가져오기를 검증했다.

## 사용자 입력 후속 — 2026-09-22

- 제공 품질 참고자료와 사용자가 올린 평판재하 CSV를 별도 진입으로 구분한다. 합성 검증 예제는 합성으로 표시한다.
- 추가 계측 기준은 단위·방향·값·근거·확인자를 직접 확인한 경우에만 비교한다. 원문 보고서 기준을 상속하지 않으며 입력이 바뀌면 재확인을 요구한다.
- 센서별 초안과 저장 기록을 분리하고, 검토 개정이 연결 이슈를 갱신해도 이전 조치는 보존한다.
- 자동 입력 날짜는 한국 현장 기준 Asia/Seoul을 사용하며 과거 기록이나 사용자가 지정한 날짜는 바꾸지 않는다.

## 역사 기록 — 초기 합성 공개판

이하 결정은 초기 합성판 당시의 기록이다. 현재 자료범위는 위 후속 결정을 따른다.

2026-09-21: React/TypeScript/Vite static client, Three.js, custom accessible SVG charts, IndexedDB persistence. Reuse numerical engines selectively. No external AI API. Only synthetic site assets published; real source audits stay outside app repository.
Shared schema and ownership defined in docs/INTEGRATION_CONTRACT.md. Deployment access was verified using the user's existing GitHub/Vercel connection.

- 17:24 KST 이후 기존 코드의 관련 계산 시험을 다시 실행했다. 과거 성공 기록을 이번 결과로 대체하지 않았다.
- 공개 GitHub 소유자 geotech-0 및 준비된 Vercel workspace에서 초기 정적 배포를 실제 확인했다. 추가 결제와 인증범위 확대 없이 기존 로그인/통합을 사용했다.
- 공통 IndexedDB v2에 기록별 개정 snapshot을 저장한다. 동시 저장은 한 transaction에서 개정을 증가시키고 JSON import는 충돌 시 전체 취소한다.
- 오래 열린 v1 연결이 migration을 막는 경우를 확인했다. 열기 제한시간과 재시도 안내를 제공하며 기록 삭제로 해결하지 않는다.
- 기능별 예제는 미리 채우되 초기 안내 문구를 실제 '미해결 검토 기록'으로 저장하지 않는다. 실제 저장한 결과와 안내가 중복되는 혼동을 줄인다.
- 배포 버전은 Vercel의 git commit 환경값에서 version.json 및 HTML meta로 생성한다. 최종 소스와 공개본 동일성 검증에 사용한다.
- 독립 검수에서 React.lazy의 실패한 import가 재시도에도 캐시되는 것을 확인했다. 오류 화면의 다시 시도는 문서를 새로 불러와 실제 네트워크 재시도를 수행한다.
- 앵커 강선 수와 토류판 단면 변경도 EA/EI에 영향을 줄 수 있으므로 외부 해석결과 재확인 대상으로 포함한다.
