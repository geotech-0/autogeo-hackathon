import { useId, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ClipboardList,
  MapPin,
  Plus,
  Radar,
  Save,
  Search,
  Upload,
  RotateCcw,
  Archive,
  Pencil,
  CheckCircle2,
} from "lucide-react";
import type { DataOrigin, FeatureProps, ProjectRecord } from "../../contracts";
import { useDraft } from "../../storage/useDraft";
import {
  SAMPLE_GPR,
  LIFECYCLE,
  STAGE_NAMES,
  validateGpr,
  transitionGpr,
  gprStatus,
  validDate,
} from "./model.mjs";
import "./maintenance.css";

type History = {
  id: string;
  stage: string;
  date: string;
  note: string;
  author: string;
  kind?: string;
};
type GprModel = Omit<typeof SAMPLE_GPR, "attachment" | "history"> & {
  attachment: { name: string; dataUrl: string } | null;
  history: History[];
};
type Form = {
  recordId: string | null;
  model: GprModel;
  editing: boolean;
  showArchived: boolean;
  event: { date: string; author: string; note: string };
};
const initial: Form = {
  recordId: null,
  model: structuredClone(SAMPLE_GPR),
  editing: false,
  showArchived: false,
  event: { date: "2027-03-05", author: "현장 검토 담당", note: "" },
};
const stageName = (stage: string) =>
  STAGE_NAMES[stage as keyof typeof STAGE_NAMES] || stage;

function Interpretation({ model }: { model: GprModel }) {
  const id = useId().replace(/:/g, "");
  const x = Number(model.x),
    y = Number(model.y);
  const valid =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= 120 &&
    y >= 0 &&
    y <= 100;
  return (
    <div className="maintenance-interpretation">
      <div className="maintenance-map">
        <svg
          viewBox="0 0 600 360"
          role="img"
          aria-label={`준공 후 동측 관리도로의 GPR 이상 반사 후보. E ${model.x} m, N ${model.y} m`}
        >
          <defs>
            <pattern
              id={`grid-${id}`}
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0V40"
                fill="none"
                stroke="#e5ebe9"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="600" height="360" fill="#f0f4f2" />
          <rect
            x="50"
            y="25"
            width="480"
            height="300"
            fill={`url(#grid-${id})`}
            stroke="#d5e0d9"
          />
          <path d="M50 290H530M490 25V325" stroke="#b8c5c3" strokeWidth="24" />
          <path
            d="M50 290H530M490 25V325"
            stroke="#edf2ef"
            strokeWidth="2"
            strokeDasharray="8 6"
          />
          <rect
            x="190"
            y="100"
            width="200"
            height="150"
            rx="3"
            fill="#d5e1df"
            stroke="#92aaa7"
            strokeWidth="2"
          />
          <rect x="204" y="114" width="172" height="122" fill="#e7eeeb" />
          <path
            d="M204 154H376M204 194H376M260 114V236M318 114V236"
            stroke="#c8d6d1"
          />
          <text
            x="290"
            y="171"
            textAnchor="middle"
            fontSize="14"
            fontWeight="600"
            fill="#647e7b"
          >
            준공 시설물
          </text>
          <text
            x="290"
            y="191"
            textAnchor="middle"
            fontSize="11"
            fill="#718986"
          >
            임시 흙막이와 별도 객체
          </text>
          <rect
            x="80"
            y="45"
            width="58"
            height="40"
            fill="#d4ded8"
            stroke="#a2b1a7"
          />
          <rect
            x="405"
            y="45"
            width="43"
            height="36"
            fill="#d4ded8"
            stroke="#a2b1a7"
          />
          <line
            x1="490"
            x2="490"
            y1="70"
            y2="262"
            stroke="#1977d7"
            strokeWidth="3"
            strokeDasharray="6 4"
          />
          <rect x="435" y="38" width="112" height="24" rx="4" fill="#fff" />
          <text
            x="491"
            y="54"
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="#266ca4"
          >
            {model.line || "측선 미입력"}
          </text>
          {valid && (
            <g>
              <rect
                x={50 + x * 4 - Number(model.width) * 2}
                y={325 - y * 3 - Number(model.length) * 1.5}
                width={Number(model.width) * 4 || 8}
                height={Number(model.length) * 3 || 8}
                fill="#e9a348"
                fillOpacity=".35"
                stroke="#cc7c27"
                strokeWidth="2"
              />
              <circle
                cx={50 + x * 4}
                cy={325 - y * 3}
                r="5"
                fill="#cf8434"
                stroke="#fff"
                strokeWidth="2"
              />
            </g>
          )}
          {[0, 30, 60, 90, 120].map((v) => (
            <text
              x={50 + v * 4}
              y="344"
              fontSize="11"
              fill="#708781"
              textAnchor="middle"
              key={v}
            >
              {v}
            </text>
          ))}
          <text x="582" y="344" textAnchor="end" fontSize="11" fill="#708781">
            E (m)
          </text>
          <path
            d="M566 82V46M560 56L566 44L572 56"
            stroke="#627c76"
            strokeWidth="2"
            fill="none"
          />
          <text x="566" y="34" textAnchor="middle" fontSize="12" fill="#627c76">
            N
          </text>
          <rect x="72" y="304" width="106" height="24" rx="4" fill="#fff" />
          <text
            x="125"
            y="320"
            textAnchor="middle"
            fontSize="11"
            fill="#55716d"
          >
            A현장 로컬 좌표
          </text>
        </svg>
        <div className="maintenance-map-legend">
          <span>
            <i className="maintenance-line-key" />
            조사 측선
          </span>
          <span>
            <i className="maintenance-area-key" />
            이상 반사 후보
          </span>
          <span>준공 후 별도 시설물</span>
        </div>
      </div>
      <div className="maintenance-radargram">
        <div className="maintenance-radar-heading">
          <span>해석 근거</span>
          <span>
            {model.attachment
              ? "사용자 첨부 해석도"
              : "합성 해석결과 예시 · 원신호 아님"}
          </span>
        </div>
        {model.attachment ? (
          <img
            src={model.attachment.dataUrl}
            alt={`${model.title}의 사용자 첨부 해석도`}
          />
        ) : (
          <svg
            viewBox="0 0 600 180"
            role="img"
            aria-label="해석된 이상 반사 후보 구간을 강조한 합성 단면 예시. 실제 원신호가 아닙니다."
          >
            <defs>
              <linearGradient id={`radar-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1f3a4d" />
                <stop offset="100%" stopColor="#122b3c" />
              </linearGradient>
            </defs>
            <rect width="600" height="180" fill={`url(#radar-${id})`} />
            {Array.from({ length: 15 }, (_, i) => (
              <path
                key={i}
                d={`M32 ${20 + i * 9} Q160 ${12 + i * 9} 270 ${23 + i * 9} T568 ${20 + i * 9}`}
                fill="none"
                stroke={i % 2 ? "#598c9f" : "#b5c7c1"}
                strokeWidth={i % 3 ? 1 : 2}
                opacity={i % 2 ? 0.55 : 0.3}
              />
            ))}
            <rect
              x="310"
              y="26"
              width="136"
              height="120"
              fill="#e8a346"
              fillOpacity=".15"
              stroke="#e8b36d"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            {[0, 1, 2, 3].map((i) => (
              <path
                key={i}
                d={`M298 ${125 + i * 6} Q365 ${20 + i * 7} 453 ${125 + i * 6}`}
                fill="none"
                stroke={i % 2 ? "#e2cba8" : "#709cac"}
                strokeWidth="3"
                opacity=".65"
              />
            ))}
            <rect x="319" y="7" width="117" height="23" rx="3" fill="#dfae68" />
            <text
              x="377"
              y="23"
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#263945"
            >
              추가 확인 후보
            </text>
            <text x="31" y="165" fontSize="11" fill="#c3d4d9">
              합성 측선 거리 0~60 m · 깊이 축 미보정
            </text>
          </svg>
        )}
        <p>{model.evidence || "해석 근거를 입력해 주세요."}</p>
      </div>
    </div>
  );
}

export default function MaintenancePage({
  records,
  onSave,
  notify,
}: FeatureProps) {
  const [form, setForm, { ready, error: draftError, retry }] = useDraft<Form>(
    "maintenance-form-v1",
    initial,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [eventError, setEventError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const model = form.model;
  const currentIndex = LIFECYCLE.indexOf(model.lifecycle);
  const nextStage = LIFECYCLE[currentIndex + 1];
  const allGpr = records.filter(
    (r) => r.stage === "maintenance" && r.payload.kind === "gpr_anomaly",
  );
  const visibleGpr = allGpr.filter(
    (r) =>
      Boolean((r.payload.model as GprModel)?.archived) === form.showArchived,
  );
  const change = (key: keyof GprModel, value: unknown) => {
    setForm((v) => ({ ...v, model: { ...v.model, [key]: value } }));
    setSavedMessage("");
    setErrors((e) => ({ ...e, [key]: "" }));
  };
  const persist = async (candidate: GprModel, message: string) => {
    const validation = validateGpr(candidate) as Record<string, string>;
    setErrors(validation);
    if (Object.keys(validation).length) {
      setForm((v) => ({ ...v, editing: true }));
      notify("조사 정보의 필수 입력을 확인해 주세요.", "error");
      const first = Object.keys(validation)[0];
      setTimeout(() => document.getElementById(`gpr-${first}`)?.focus(), 0);
      return false;
    }
    setSaving(true);
    const savedModel = candidate.history.length
      ? candidate
      : {
          ...candidate,
          history: [
            {
              id: crypto.randomUUID(),
              stage: "survey",
              date: candidate.surveyDate,
              author: candidate.interpreter,
              note: "조사 해석결과와 추가 확인 사항을 등록했습니다.",
            },
          ],
        };
    try {
      const record = await onSave({
        ...(form.recordId ? { id: form.recordId } : {}),
        stage: "maintenance",
        title: savedModel.title,
        summary: `${savedModel.line} · ${stageName(savedModel.lifecycle)}${savedModel.closed ? " · 확인 완료" : " · 추가 확인 사항 관리"}`,
        status: gprStatus(savedModel),
        origin: savedModel.origin as DataOrigin,
        asset_id: "a01-permanent-pavement-p01",
        source_id:
          savedModel.origin === "synthetic"
            ? "synthetic-a-gpr-v1"
            : "user-local-gpr-interpretation",
        source_revision: String(
          (allGpr.find((r) => r.id === form.recordId)?.revision || 0) + 1,
        ),
        method_version: "interpreted-gpr-lifecycle-v1",
        assumptions: [
          "이미 해석된 결과의 위치와 후속 이력을 관리합니다. 원신호 자동 판독이나 손상 확정 기능이 아닙니다.",
          "준공 후 관리도로 객체이며 임시 흙막이와 구분합니다.",
        ],
        payload: {
          kind: "gpr_anomaly",
          model: savedModel,
          location: {
            x: Number(savedModel.x),
            y: Number(savedModel.y),
            frame: "local-synthetic-meters",
          },
          archived: savedModel.archived,
        },
      });
      setForm((v) => ({
        ...v,
        recordId: record.id,
        model: savedModel,
        editing: false,
      }));
      setSavedMessage(message);
      notify(message, "success");
      return true;
    } catch {
      notify(
        "기록을 저장하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.",
        "error",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  const advance = async () => {
    setEventError("");
    try {
      const candidate = transitionGpr(model, {
        ...form.event,
        id: crypto.randomUUID(),
      }) as GprModel;
      if (
        await persist(
          candidate,
          `${stageName(candidate.lifecycle)} 기록을 저장했습니다.`,
        )
      )
        setForm((v) => ({ ...v, event: { ...v.event, note: "" } }));
    } catch (e) {
      setEventError(
        e instanceof Error ? e.message : "기록 내용을 확인해 주세요.",
      );
    }
  };
  const appendNote = async (close = false) => {
    if (!form.event.note.trim() || !form.event.author.trim()) {
      setEventError("재점검 결과와 기록 담당자를 입력해 주세요.");
      return;
    }
    const latest = model.history.reduce(
      (a, h) => (h.date > a ? h.date : a),
      model.surveyDate,
    );
    if (!validDate(form.event.date) || form.event.date < latest) {
      setEventError(
        `올바른 수행일을 입력하세요. 최근 기록일(${latest})보다 빠를 수 없습니다.`,
      );
      return;
    }
    setEventError("");
    const next = {
      ...model,
      closed: close,
      history: [
        ...model.history,
        {
          id: crypto.randomUUID(),
          stage: model.lifecycle,
          date: form.event.date,
          note: `${close ? "[확인 완료] " : ""}${form.event.note}`,
          author: form.event.author,
        },
      ],
    };
    if (
      await persist(
        next,
        close ? "재점검 확인을 마감했습니다." : "후속 메모를 저장했습니다.",
      )
    )
      setForm((v) => ({ ...v, event: { ...v.event, note: "" } }));
  };
  const select = (record: ProjectRecord) => {
    const next = record.payload.model as GprModel;
    if (!next) return;
    const latestDate = next.history.reduce(
      (date, h) => (h.date > date ? h.date : date),
      next.surveyDate,
    );
    setForm((v) => ({
      ...v,
      recordId: record.id,
      model: structuredClone(next),
      editing: false,
      event: { ...v.event, date: latestDate, note: "" },
    }));
    setErrors({});
    setEventError("");
    setSavedMessage("");
    setConfirmArchive(false);
  };
  const newRecord = () => {
    setForm((v) => ({
      ...v,
      recordId: null,
      model: {
        ...structuredClone(SAMPLE_GPR),
        title: "",
        line: "",
        interpreter: "",
        evidence: "",
        findings: "",
        followUp: "",
        history: [],
      },
      editing: true,
      event: { ...v.event, note: "" },
    }));
    setErrors({});
    setSavedMessage("");
  };
  const toggleArchived = async () => {
    if (!form.recordId) return;
    const archived = !model.archived;
    const candidate = {
      ...model,
      archived,
      history: [
        ...model.history,
        {
          id: crypto.randomUUID(),
          stage: model.lifecycle,
          date: model.history.at(-1)?.date || model.surveyDate,
          author: "현장 검토 담당",
          note: archived
            ? "목록에서 보관 처리했습니다. 이력은 유지됩니다."
            : "보관한 기록을 복원했습니다.",
          kind: archived ? "archive" : "restore",
        },
      ],
    };
    if (
      await persist(
        candidate,
        archived
          ? "기록을 보관했습니다. 보관함에서 복원할 수 있습니다."
          : "기록을 복원했습니다.",
      )
    ) {
      setForm((v) => ({ ...v, showArchived: archived }));
      setConfirmArchive(false);
    }
  };
  const attach = async (file: File | undefined) => {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 1_500_000
    ) {
      notify("PNG·JPEG·WebP 해석도(1.5 MB 이하)를 선택해 주세요.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      change("attachment", { name: file.name, dataUrl: String(reader.result) });
      change("origin", "");
      notify(
        "해석도를 첨부했습니다. 조사 정보에서 합성/실측 출처를 지정해 주세요.",
        "info",
      );
      setForm((v) => ({ ...v, editing: true }));
    };
    reader.onerror = () => notify("해석도를 읽지 못했습니다.", "error");
    reader.readAsDataURL(file);
  };
  const field = (
    key: keyof GprModel,
    label: string,
    options?: { type?: string; textarea?: boolean; help?: string },
  ) => (
    <label
      className={`field ${errors[key] ? "maintenance-field-error" : ""}`}
      htmlFor={`gpr-${key}`}
    >
      {label}
      {options?.textarea ? (
        <textarea
          id={`gpr-${key}`}
          rows={3}
          value={String(model[key] || "")}
          onChange={(e) => change(key, e.target.value)}
          aria-invalid={!!errors[key]}
        />
      ) : (
        <input
          id={`gpr-${key}`}
          type={options?.type || "text"}
          value={String(model[key] ?? "")}
          onChange={(e) => change(key, e.target.value)}
          aria-invalid={!!errors[key]}
        />
      )}
      <span
        className={errors[key] ? "maintenance-input-error" : "maintenance-help"}
      >
        {errors[key] || options?.help || ""}
      </span>
    </label>
  );
  return (
    <div className="maintenance-page">
      <header className="maintenance-page-heading">
        <div>
          <div className="eyebrow">MAINTENANCE · A-01</div>
          <h1>조사 이후의 판단까지, 이어서</h1>
          <p className="muted">
            해석 근거와 확인·조치·재점검을 시설물별로 남깁니다.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={!ready}
          onClick={newRecord}
        >
          <Plus size={17} />
          조사 기록 추가
        </button>
      </header>
      <div className="maintenance-context">
        <span>
          <Radar size={17} />
          GPR 해석결과·이력 관리
        </span>
        <span>준공 후 관리도로 P-01 · 임시 흙막이와 별도 시설물</span>
        <span className="maintenance-synthetic-badge">
          {model.origin === "synthetic"
            ? "합성 시나리오 · 2027년"
            : model.origin === "measured"
              ? "사용자 실측 해석결과"
              : "출처 확인 필요"}
        </span>
      </div>
      {draftError && (
        <div className="notice notice-error" role="alert">
          작성 내용 자동 보관에 문제가 있습니다. {draftError}
          <p>다시 불러오면 현재 화면의 변경 내용이 저장된 입력으로 바뀝니다.</p>
          <button
            className="btn btn-secondary"
            onClick={retry}
            disabled={!ready}
          >
            저장된 입력 다시 불러오기
          </button>
        </div>
      )}
      {!ready ? (
        <div className="panel maintenance-loading">
          작성한 조사 정보를 불러오고 있습니다…
        </div>
      ) : (
        <>
          <div className="maintenance-workspace">
            <aside className="panel maintenance-records">
              <div className="panel-header">
                <h2>조사 목록</h2>
                <span>{visibleGpr.length}건 저장</span>
              </div>
              <label className="maintenance-archive-toggle">
                <input
                  type="checkbox"
                  checked={form.showArchived}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, showArchived: e.target.checked }))
                  }
                />
                보관한 기록 보기
              </label>
              {!form.recordId && !form.showArchived && (
                <button
                  className="maintenance-record-card active"
                  onClick={() => setForm((v) => ({ ...v, editing: false }))}
                >
                  <span className="maintenance-record-eyebrow">
                    {model.line || "새 조사"} · 저장 전
                  </span>
                  <strong>{model.title || "새 조사 기록"}</strong>
                  <span>입력 후 저장하면 현장 이력에 연결됩니다</span>
                </button>
              )}
              {visibleGpr.map((r) => {
                const m = r.payload.model as GprModel;
                return (
                  <button
                    key={r.id}
                    className={`maintenance-record-card ${r.id === form.recordId ? "active" : ""}`}
                    onClick={() => select(r)}
                  >
                    <span className="maintenance-record-eyebrow">
                      {m.line} · {m.surveyDate}
                    </span>
                    <strong>{r.title}</strong>
                    <span>
                      {stageName(m.lifecycle)}
                      {m.closed ? " · 확인 완료" : " · 진행 중"}
                    </span>
                  </button>
                );
              })}
              {!visibleGpr.length && form.showArchived && (
                <p className="muted maintenance-list-empty">
                  보관한 기록이 없습니다.
                </p>
              )}
              <div className="maintenance-records-note">
                <Search size={16} />
                <p>
                  위치와 근거를 연결하고
                  <br />
                  다음에 확인할 일을 남깁니다.
                </p>
              </div>
            </aside>
            <div className="maintenance-detail">
              <section className="panel maintenance-summary">
                <div className="panel-header">
                  <div>
                    <div className="eyebrow">
                      {model.line || "NEW SURVEY"} · {model.surveyDate}
                    </div>
                    <h2>{model.title || "조사 정보를 입력해 주세요"}</h2>
                  </div>
                  <div className="maintenance-summary-actions">
                    <span
                      className={`badge ${model.closed ? "badge-success" : "badge-warning"}`}
                    >
                      {model.archived
                        ? "보관된 기록"
                        : model.closed
                          ? "확인 완료"
                          : `${stageName(model.lifecycle)} · 진행 중`}
                    </span>
                    <button
                      className="btn btn-ghost"
                      onClick={() =>
                        setForm((v) => ({ ...v, editing: !v.editing }))
                      }
                    >
                      <Pencil size={15} />
                      정보 수정
                    </button>
                  </div>
                </div>
                <div
                  className="maintenance-steps"
                  aria-label="조사 후속 이력 진행 단계"
                >
                  {LIFECYCLE.map((stage, i) => (
                    <div
                      key={stage}
                      className={`${i <= currentIndex ? "complete" : ""} ${i === currentIndex ? "current" : ""}`}
                    >
                      <span>
                        {i < currentIndex || model.closed ? (
                          <Check size={15} />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <strong>{stageName(stage)}</strong>
                      {i < 3 && (
                        <ArrowRight
                          size={15}
                          className="maintenance-step-arrow"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <Interpretation model={model} />
                <div className="maintenance-facts">
                  <div>
                    <span>조사 대상</span>
                    <strong>{model.asset}</strong>
                  </div>
                  <div>
                    <span>후보 중심 위치</span>
                    <strong>
                      E {model.x} / N {model.y} m
                    </strong>
                  </div>
                  <div>
                    <span>해석된 깊이</span>
                    <strong>{model.depth || "미확인"}</strong>
                  </div>
                  <div>
                    <span>해석자·출처</span>
                    <strong>{model.interpreter || "미입력"}</strong>
                  </div>
                </div>
                <div className="maintenance-interpretation-notes">
                  <div>
                    <h3>해석 의견</h3>
                    <p>
                      {model.findings ||
                        "조사 정보에서 해석 의견을 입력해 주세요."}
                    </p>
                  </div>
                  <div>
                    <h3>추가 확인 사항</h3>
                    <p>
                      {model.followUp || "추가로 확인할 사항을 입력해 주세요."}
                    </p>
                  </div>
                </div>
                <p className="maintenance-limit-note">
                  GPR 원신호 자동 판독이나 손상 확정 결과가 아닙니다. 해석자
                  의견과 확인조사 근거를 함께 검토합니다.
                </p>
                {!form.recordId && (
                  <div className="maintenance-unsaved-bar">
                    <span>현재 예제는 아직 저장되지 않았습니다.</span>
                    <button
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={() =>
                        persist(model, "조사 기록을 현장 이력에 저장했습니다.")
                      }
                    >
                      <Save size={16} />
                      {saving ? "저장 중…" : "조사 기록 저장"}
                    </button>
                  </div>
                )}
              </section>
              {form.editing && (
                <section className="panel maintenance-edit-panel">
                  <div className="panel-header">
                    <h2>조사 정보 편집</h2>
                    <span className="muted">
                      필수 정보를 확인한 뒤 저장하세요
                    </span>
                  </div>
                  <div className="maintenance-edit-grid">
                    {field("title", "조사 이름")}
                    {field("line", "측선 ID")}
                    <label className="field" htmlFor="gpr-asset">
                      준공 후 시설물
                      <input id="gpr-asset" value={SAMPLE_GPR.asset} readOnly />
                      <span className="maintenance-help">
                        P-01 고정 · 임시 흙막이와 별도 시설물
                      </span>
                    </label>
                    {field("surveyDate", "조사일", { type: "date" })}
                    {field("interpreter", "해석자 또는 합성 표시")}
                    {field("equipment", "장비·주파수 정보")}
                    {field("x", "중심 E (m)", {
                      type: "number",
                      help: "현장 로컬 좌표 0~120 m",
                    })}
                    {field("y", "중심 N (m)", {
                      type: "number",
                      help: "현장 로컬 좌표 0~100 m",
                    })}
                    {field("width", "이상구역 폭 (m)", { type: "number" })}
                    {field("length", "이상구역 길이 (m)", { type: "number" })}
                    {field("depth", "해석된 깊이·가정", {
                      help: "미확인이면 비워 두세요. 임의 깊이를 입력하지 않습니다.",
                    })}
                    <label className="field" htmlFor="gpr-origin">
                      데이터 출처
                      <select
                        id="gpr-origin"
                        value={model.origin}
                        onChange={(e) => change("origin", e.target.value)}
                      >
                        <option value="">출처를 선택하세요</option>
                        <option value="synthetic">합성·시연 데이터</option>
                        <option value="measured">
                          실측 해석결과 · 사용자 확인
                        </option>
                      </select>
                      {errors.origin && (
                        <span className="maintenance-input-error">
                          {errors.origin}
                        </span>
                      )}
                    </label>
                  </div>
                  <div className="maintenance-edit-wide">
                    {field("evidence", "해석 근거·도면·페이지")}
                    {field("findings", "해석 의견", { textarea: true })}
                    {field("followUp", "추가 확인 사항", { textarea: true })}
                  </div>
                  <div className="maintenance-edit-actions">
                    <label className="btn btn-secondary maintenance-upload">
                      <Upload size={16} />
                      해석도 첨부
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          void attach(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {model.attachment && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => change("attachment", null)}
                      >
                        첨부 해석도 제거
                      </button>
                    )}
                    <button
                      className="btn btn-primary"
                      disabled={saving}
                      onClick={() =>
                        persist(model, "조사 정보 변경을 저장했습니다.")
                      }
                    >
                      <Save size={16} />
                      {saving ? "저장 중…" : "조사 정보 저장"}
                    </button>
                  </div>
                </section>
              )}
              <section className="panel maintenance-history-panel">
                <div className="panel-header">
                  <h2>
                    <ClipboardList size={19} />
                    확인·조치 이력
                  </h2>
                  <span className="muted">기존 기록을 보존합니다</span>
                </div>
                <div className="maintenance-history-content">
                  <ol className="maintenance-timeline">
                    {model.history.length ? (
                      model.history.map((item, index) => (
                        <li key={item.id}>
                          <span
                            className={`maintenance-timeline-dot ${index === model.history.length - 1 ? "current" : ""}`}
                          />
                          <div className="maintenance-timeline-top">
                            <strong>
                              {item.kind === "archive"
                                ? "보관"
                                : item.kind === "restore"
                                  ? "복원"
                                  : item.kind === "reopen"
                                    ? "검토 재개"
                                    : stageName(item.stage)}
                            </strong>
                            <time>{item.date}</time>
                          </div>
                          <p>{item.note}</p>
                          <span className="maintenance-history-author">
                            {item.author}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li>
                        <p className="muted">
                          조사 기록을 저장하면 이력이 시작됩니다.
                        </p>
                      </li>
                    )}
                  </ol>
                  <div className="maintenance-next-action">
                    {model.archived ? (
                      <>
                        <h3>보관한 기록</h3>
                        <p>
                          이력은 보존되어 있습니다. 복원하면 후속 기록을 이어갈
                          수 있습니다.
                        </p>
                        <button
                          className="btn btn-secondary"
                          disabled={saving}
                          onClick={toggleArchived}
                        >
                          <RotateCcw size={16} />
                          기록 복원
                        </button>
                      </>
                    ) : model.closed ? (
                      <>
                        <div className="maintenance-closed-icon">
                          <CheckCircle2 size={25} />
                        </div>
                        <h3>재점검 확인을 마쳤습니다</h3>
                        <p>
                          기존 조사·확인·조치 근거와 재점검 결과가 하나의
                          이력으로 남아 있습니다.
                        </p>
                        <button
                          className="btn btn-secondary"
                          disabled={saving}
                          onClick={() =>
                            persist(
                              {
                                ...model,
                                closed: false,
                                history: [
                                  ...model.history,
                                  {
                                    id: crypto.randomUUID(),
                                    stage: model.lifecycle,
                                    date:
                                      model.history.at(-1)?.date ||
                                      model.surveyDate,
                                    author: "현장 검토 담당",
                                    note: "후속 검토를 다시 열었습니다.",
                                    kind: "reopen",
                                  },
                                ],
                              },
                              "후속 검토를 다시 열었습니다.",
                            )
                          }
                        >
                          <RotateCcw size={16} />
                          후속 검토 다시 열기
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="maintenance-next-label">
                          다음 할 일
                        </span>
                        <h3>
                          {nextStage
                            ? `${stageName(nextStage)} 내용 기록`
                            : "재점검 결과 확인"}
                        </h3>
                        <p>
                          {nextStage === "confirmation"
                            ? "추가 조사나 현장 확인의 내용과 근거를 남겨 주세요."
                            : nextStage === "action"
                              ? "검토 후 선택한 조치와 담당·수행 근거를 남겨 주세요."
                              : nextStage === "reinspection"
                                ? "동일 구간 재점검 결과와 남은 확인 사항을 기록하세요."
                                : "추가 메모를 남기거나 확인 결과를 명시한 뒤 마감할 수 있습니다."}
                        </p>
                        <div className="maintenance-event-fields">
                          <label className="field">
                            수행일
                            <input
                              type="date"
                              value={form.event.date}
                              onChange={(e) =>
                                setForm((v) => ({
                                  ...v,
                                  event: { ...v.event, date: e.target.value },
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            기록 담당자
                            <input
                              value={form.event.author}
                              onChange={(e) =>
                                setForm((v) => ({
                                  ...v,
                                  event: { ...v.event, author: e.target.value },
                                }))
                              }
                            />
                          </label>
                        </div>
                        <label className="field">
                          수행 내용·근거
                          <textarea
                            rows={4}
                            value={form.event.note}
                            placeholder="확인한 내용, 자료와 다음 확인 사항을 적어 주세요."
                            onChange={(e) => {
                              setForm((v) => ({
                                ...v,
                                event: { ...v.event, note: e.target.value },
                              }));
                              setEventError("");
                            }}
                          />
                        </label>
                        {eventError && (
                          <p className="maintenance-input-error" role="alert">
                            {eventError}
                          </p>
                        )}
                        <button
                          className="btn btn-primary"
                          disabled={saving}
                          onClick={
                            nextStage ? advance : () => appendNote(false)
                          }
                        >
                          {saving
                            ? "저장 중…"
                            : nextStage
                              ? `${stageName(nextStage)} 기록 저장`
                              : "후속 메모 저장"}
                          <ArrowRight size={16} />
                        </button>
                        {!nextStage && (
                          <button
                            className="btn btn-secondary"
                            disabled={saving}
                            onClick={() => appendNote(true)}
                          >
                            <CheckCircle2 size={16} />
                            확인 완료로 마감
                          </button>
                        )}
                      </>
                    )}
                    {savedMessage && (
                      <p className="maintenance-save-message" role="status">
                        <CheckCircle2 size={15} />
                        {savedMessage}
                      </p>
                    )}
                  </div>
                </div>
              </section>
              {form.recordId && !model.archived && (
                <div className="maintenance-archive-area">
                  {confirmArchive ? (
                    <div className="maintenance-archive-confirm" role="alert">
                      <span>
                        이 기록을 목록에서 보관할까요? 기록과 이력은 보관함에서
                        복원할 수 있습니다.
                      </span>
                      <button
                        className="btn btn-secondary"
                        disabled={saving}
                        onClick={toggleArchived}
                      >
                        보관하기
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => setConfirmArchive(false)}
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setConfirmArchive(true)}
                    >
                      <Archive size={15} />
                      조사 기록 보관
                    </button>
                  )}
                </div>
              )}
              <details className="maintenance-method-note">
                <summary>
                  기록의 범위와 해석 조건 <ChevronDown size={15} />
                </summary>
                <p>
                  해석결과에서 지정한 후보 구역을 관리합니다. 깊이는 해석자의
                  값과 가정을 그대로 기록하며, 신호를 분석해 자동 산정하지
                  않습니다. 조치 권고는 확인조사·기술검토 후보이며 자동
                  보강설계가 아닙니다. 합성 A현장의 유지관리는 2027년 준공 후
                  시나리오로, 시공 중 흙막이와 다른 시설물에 속합니다.
                </p>
              </details>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
