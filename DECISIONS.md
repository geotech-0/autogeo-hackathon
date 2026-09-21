# Decisions

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
