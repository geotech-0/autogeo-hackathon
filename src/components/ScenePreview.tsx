import { useEffect, useState } from "react";
export default function ScenePreview() {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/ground/site-assets.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("영상 정보 읽기 실패");
        return r.json();
      })
      .then((data) => {
        if (!data.orthophoto?.url) throw new Error("영상 경로 없음");
        setSrc(data.orthophoto.previewUrl || data.orthophoto.url);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="real-site-preview">
      {src && !failed ? (
        <img
          src={src}
          alt="제공된 이천자이더리체 현장의 실제 드론 정사영상"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="real-site-preview-state">
          {failed
            ? "정사영상을 불러오지 못했습니다. 지반 화면에서 다시 확인하세요."
            : "현장 정사영상을 불러오는 중입니다."}
        </div>
      )}
      <div className="real-site-preview-label">
        <span>ICHEON XI THE RICHE</span>
        <strong>실제 현장 정사영상</strong>
        <small>드론 · 시추공 · 도면 · 지층 모델</small>
      </div>
    </div>
  );
}
