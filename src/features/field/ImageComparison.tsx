import { siteDate } from "../../utils/site-date.mjs";
import { useEffect, useState } from "react";
import { MapPin, Save, Upload } from "lucide-react";
import type { FeatureProps } from "../../contracts";
import { useDraft } from "../../storage/useDraft";
import {
  saveAttachment,
  getAttachmentUrl,
  type AttachmentMeta,
} from "../../storage/attachments";
import RealSiteMap, { useSiteAssets } from "../ground/RealSiteMap";
import { annotationPosition } from "./image-position.mjs";
import { useRequestedRecord } from "./useRequestedRecord";
export default function ImageComparison(props: FeatureProps) {
  const [draft, setDraft, state] = useDraft("real-field-imagery-v1", {
    easting: "",
    northing: "",
    note: "",
    author: "",
    captureDate: "",
    epochName: "",
    attachment: null as AttachmentMeta | null,
  });
  useRequestedRecord(
    props.requestedRecordId,
    props.records,
    state.ready,
    (r) => {
      if (r.payload.kind === "real_image_annotation")
        setDraft((d) => ({
          ...d,
          easting: String(r.payload.easting),
          northing: String(r.payload.northing),
          note: String(r.payload.note || ""),
          author: String(r.payload.author || ""),
        }));
      if (r.payload.kind === "additional_orthophoto")
        setDraft((d) => ({
          ...d,
          attachment: (r.payload.attachments as AttachmentMeta[])?.[0] || null,
          epochName: String(r.payload.epochName || ""),
          captureDate: String(r.payload.captureDate || ""),
        }));
    },
  );
  const [saving, setSaving] = useState(false);
  const [positionError, setPositionError] = useState("");
  const { assets, error: assetError } = useSiteAssets();
  let position: { easting: number; northing: number } | null = null;
  try {
    position = annotationPosition(
      draft.easting,
      draft.northing,
      assets?.orthophoto.boundsEN,
    );
  } catch {
    /* Empty or incomplete input remains editable. */
  }
  const [imageUrl, setImageUrl] = useState("");
  useEffect(() => {
    let active = true,
      url = "";
    if (draft.attachment)
      getAttachmentUrl(draft.attachment.id)
        .then((v) => {
          url = v;
          if (active) setImageUrl(v);
          else URL.revokeObjectURL(v);
        })
        .catch((e) => props.notify(e.message, "error"));
    else setImageUrl("");
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft.attachment?.id]);
  const groundRecord = [...props.records]
    .filter((r) => r.payload.kind === "real-ground-model")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const groundTransform = groundRecord?.payload.registration as
    | { east: number; north: number; rotation: number; scale: number }
    | undefined;
  const annotations = props.records
    .filter(
      (r) =>
        r.payload.kind === "real_image_annotation" ||
        (r.payload.kind === "real_field_issue" && r.payload.imageAnnotation),
    )
    .map((r) => ({
      id: r.id,
      easting: Number(r.payload.easting),
      northing: Number(r.payload.northing),
      label: r.title,
    }))
    .filter((r) => Number.isFinite(r.easting) && Number.isFinite(r.northing));
  const change = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setPositionError("");
  };
  async function save(issue: boolean) {
    if (!state.ready || saving) return;
    setSaving(true);
    setPositionError("");
    try {
      const coordinates = annotationPosition(
        draft.easting,
        draft.northing,
        assets?.orthophoto.boundsEN,
      );
      if (!draft.note.trim() || !draft.author.trim())
        throw new Error(
          "지도에서 위치를 선택하고 주석·담당자를 입력해 주세요.",
        );
      await props.onSave({
        stage: "construction",
        origin: "measured",
        source_id: "icheon-orthophoto-01",
        status: issue ? "pending" : "draft",
        title: `현장 영상 ${issue ? "확인 이슈" : "주석"}`,
        summary: draft.note,
        payload: {
          kind: issue ? "real_field_issue" : "real_image_annotation",
          registration: groundTransform || null,
          registrationSource: groundRecord
            ? { id: groundRecord.id, revision: groundRecord.revision }
            : null,
          imageAnnotation: true,
          easting: coordinates.easting,
          northing: coordinates.northing,
          crs: "EPSG:5186",
          captureDate: null,
          note: draft.note,
          author: draft.author,
          sourceUrl: "/data/ground/site-assets.json",
          ...(issue
            ? {
                lifecycle: "identified",
                history: [
                  {
                    stage: "identified",
                    date: siteDate(),
                    author: draft.author,
                    note: draft.note,
                  },
                ],
              }
            : {}),
        },
        assumptions: [
          "원본 촬영일 미제공. 한 회차 영상의 관찰 주석이며 변형량 분석이 아닙니다.",
        ],
      });
      props.notify("영상 위치와 검토 기록을 저장했습니다.", "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "저장 실패";
      setPositionError(message);
      props.notify(message, "error");
    } finally {
      setSaving(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setSaving(true);
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        throw new Error("추가 영상은 PNG·JPG·WebP를 선택해 주세요.");
      const attachment = await saveAttachment(file, "additional-orthophoto");
      setDraft((d) => ({ ...d, attachment, epochName: file.name }));
      props.notify(
        "추가 영상을 로컬에 보관했습니다. 촬영일과 회차를 확인해 주세요.",
        "info",
      );
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "첨부 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  async function saveEpoch() {
    setSaving(true);
    try {
      if (
        !draft.attachment ||
        !draft.epochName.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(draft.captureDate) ||
        !Number.isFinite(Date.parse(draft.captureDate)) ||
        new Date(draft.captureDate).toISOString().slice(0, 10) !==
          draft.captureDate
      )
        throw new Error("추가 영상·회차 이름·촬영일을 입력해 주세요.");
      await props.onSave({
        stage: "construction",
        origin: "measured",
        source_id: "user-orthophoto",
        title: `추가 영상 · ${draft.epochName}`,
        status: "pending",
        summary: `${draft.captureDate} 촬영 · 좌표 정합 확인 대기`,
        payload: {
          kind: "additional_orthophoto",
          attachment_ids: [draft.attachment.id],
          attachments: [draft.attachment],
          captureDate: draft.captureDate,
          epochName: draft.epochName,
          registrationStatus: "unregistered",
        },
        assumptions: [
          "추가 영상은 지리좌표 정합을 수행하지 않았습니다. 나란히 확인만 가능하며 변형량을 계산하지 않습니다.",
        ],
      });
      props.notify("추가 회차를 보존했습니다.", "success");
    } catch (e) {
      props.notify(e instanceof Error ? e.message : "저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="rf-imagery">
      {state.error && (
        <div className="rf-warning">
          {state.error}
          <button onClick={state.retry}>저장된 입력 다시 불러오기</button>현재
          입력은 저장된 값으로 바뀝니다.
        </div>
      )}
      <section className="rf-card">
        <div className="rf-heading">
          <div>
            <span className="rf-eyebrow">ORTHOPHOTO · 실제 제공 영상</span>
            <h2>현장 정사영상</h2>
            <p>제공 1회차 · 촬영일 미확인 · EPSG:5186</p>
          </div>
          <span className="badge badge-warning">회차 간 변형 판정 보류</span>
        </div>
        <RealSiteMap
          assets={assets || undefined}
          transform={groundTransform}
          annotations={
            position
              ? [
                  ...annotations,
                  {
                    id: "image-draft",
                    ...position,
                    label: "작성 중인 위치",
                    color: "#0F6FFF",
                  },
                ]
              : annotations
          }
          onMapClick={
            !state.ready || saving
              ? undefined
              : (p) => {
                  setPositionError("");
                  setDraft((d) => ({
                    ...d,
                    easting: p.easting.toFixed(3),
                    northing: p.northing.toFixed(3),
                  }));
                }
          }
        />
        <details className="rf-details rf-explanation">
          <summary>영상·좌표 확인 안내</summary>
          <div className="rf-note">
            노란 경계는 도면 정합 참고선입니다. 영상·도면의 촬영 시점과 현장
            변화를 함께 확인하세요. 확대·이동 후 클릭하면 원본 좌표에 주석이
            연결됩니다.
          </div>
        </details>
        <h3 className="rf-action-title">관찰 위치와 내용 기록</h3>
        <p className="rf-note">
          지도에서 위치를 선택하거나 E·N 좌표를 입력한 뒤, 담당자와 관찰 주석을
          작성하세요. 좌표는 원본 EPSG:5186 기준 m입니다.
        </p>
        {(positionError || assetError) && (
          <p className="rf-error" role="alert">
            {positionError || assetError}
          </p>
        )}
        <fieldset
          className="rf-action-fields"
          disabled={!state.ready || saving}
        >
          <div className="rf-grid3">
            <label className="rf-label">
              E (m)
              <input
                inputMode="decimal"
                value={draft.easting}
                onChange={(e) => change("easting", e.target.value)}
              />
            </label>
            <label className="rf-label">
              N (m)
              <input
                inputMode="decimal"
                value={draft.northing}
                onChange={(e) => change("northing", e.target.value)}
              />
            </label>
            <label className="rf-label">
              담당자
              <input
                value={draft.author}
                onChange={(e) => change("author", e.target.value)}
              />
            </label>
          </div>
          <label className="rf-label">
            관찰 주석
            <textarea
              rows={3}
              value={draft.note}
              onChange={(e) => change("note", e.target.value)}
              placeholder="관찰 위치·형태와 추가 확인할 내용을 작성하세요."
            />
          </label>
          <div className="rf-controls">
            <button
              className="btn btn-primary"
              onClick={() => save(false)}
              disabled={saving || !state.ready}
            >
              <MapPin size={16} /> 위치 주석 저장
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => save(true)}
              disabled={saving || !state.ready}
            >
              조치할 이슈로 등록
            </button>
          </div>
        </fieldset>
      </section>
      <details className="rf-card rf-optional-panel" open={!!draft.attachment}>
        <summary>다음 촬영 회차 등록·비교</summary>
        <p className="rf-note">
          현재는 실영상 1회차만 제공되었습니다. 추가 영상을 첨부하면
          원본·촬영일을 보존합니다. 좌표 정합 전에는 나란히 보는 참고 화면으로만
          사용합니다.
        </p>
        <fieldset
          className="rf-action-fields"
          disabled={!state.ready || saving}
        >
          <label className="rf-upload">
            <Upload size={16} /> 추가 영상 선택
            <input
              disabled={saving || !state.ready}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => upload(e.target.files?.[0])}
            />
          </label>
          <div className="rf-grid2">
            <label className="rf-label">
              회차 이름
              <input
                value={draft.epochName}
                onChange={(e) => change("epochName", e.target.value)}
              />
            </label>
            <label className="rf-label">
              촬영일
              <input
                type="date"
                value={draft.captureDate}
                onChange={(e) => change("captureDate", e.target.value)}
              />
            </label>
          </div>
          {imageUrl && (
            <div className="rf-image-pair">
              <figure>
                <img
                  src="/data/ground/orthophoto-preview.webp"
                  alt="기존 제공 정사영상"
                />
                <figcaption>제공 1회차 · 날짜 미확인</figcaption>
              </figure>
              <figure>
                <img src={imageUrl} alt="사용자 추가 회차, 좌표 정합 미확인" />
                <figcaption>
                  {draft.epochName} · {draft.captureDate || "날짜 입력 필요"}
                </figcaption>
              </figure>
            </div>
          )}
          <button
            className="btn btn-primary"
            onClick={saveEpoch}
            disabled={saving || !draft.attachment || !state.ready}
          >
            <Save size={16} /> 회차 저장
          </button>
        </fieldset>
        {props.records
          .filter((r) => r.payload.kind === "additional_orthophoto")
          .map((r) => (
            <div className="rf-note" key={r.id}>
              {r.title} · {String(r.payload.captureDate)} · 통합 이력에서 원본
              열기
            </div>
          ))}
      </details>
    </div>
  );
}
