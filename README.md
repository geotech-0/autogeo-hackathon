# AutoGeo

지반·설계·계측 자료를 시각화하고 검토 결과를 기록하는 해커톤용 웹 앱입니다.

[데모](https://autogeo-hackathon.vercel.app/) · [소개영상](https://autogeo-hackathon.vercel.app/data/demo/index.html) · [배포 버전](https://autogeo-hackathon.vercel.app/version.json)

## 기능

- 시추자료와 지층 3D 모델·단면 탐색
- 흙막이 부재 계산의 입력값·계산 과정·결과 비교
- 계측 추이 확인, 평판재하 CSV 검토, 조치 이력 관리
- 브라우저 내 기록·첨부 저장과 JSON 내보내기/가져오기

React · TypeScript · Vite · Three.js · PDF.js · IndexedDB로 구성한 정적 앱입니다.

## 실행

Node.js 22.13 이상과 npm이 필요합니다.

```sh
npm ci
npm run dev
```

테스트 및 공개용 빌드:

```sh
npm test
node scripts/build-derived.mjs
npm run preview
```

공개용 빌드는 `dist`를 생성하고 제공 원문 PDF·주상도 이미지·품질 원본을 출력에서 제외합니다. 기록은 현재 브라우저에 저장되며 기기 간 자동 동기화는 지원하지 않습니다.

## 범위와 출처

검토 보조용 데모이며 외부 해석기 실행이나 설계·안전 적합 판정을 대신하지 않습니다. 자료와 모델의 적용 범위는 앱의 주의사항 및 [데이터 출처](DATA_SOURCES.md)를 확인하세요.

[서드파티 라이선스·고지](public/THIRD_PARTY_NOTICES.txt) · [모델 절단 UI 참고: Seequent Slicer](https://help.seequent.com/Geo/2024.1/en-GB/Content/basics/slicer.htm)
