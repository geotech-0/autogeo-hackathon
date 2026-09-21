/** Local evidence stays available; public builds omit private original documents. */
export const HAS_PROVIDED_ORIGINALS =
  __HAS_PROVIDED_ORIGINALS__ &&
  import.meta.env.VITE_SOURCE_ACCESS !== "derived";
export const PROVIDED_SOURCE_NOTICE =
  "공개 시연에는 원본 문서를 포함하지 않았습니다. 현장 원자료본에서 해당 페이지를 확인할 수 있으며, 이 화면에는 전사한 수치와 출처를 표시합니다.";

export function isProvidedOriginal(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return (
    path.startsWith("/documents/") ||
    path.startsWith("/data/ground/logs/") ||
    path.startsWith("/data/field/quality/")
  );
}
