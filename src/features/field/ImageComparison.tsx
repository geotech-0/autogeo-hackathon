import { useId, useState } from "react";
import { MapPin, MoveHorizontal, Save } from "lucide-react";
import type { FeatureProps } from "../../contracts";
import { useDraft } from "../../storage/useDraft";

function Scene({ after }: { after: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <g>
      <defs>
        <pattern
          id={`soil-${id}`}
          width="21"
          height="17"
          patternUnits="userSpaceOnUse"
        >
          <rect width="21" height="17" fill={after ? "#bdc5b8" : "#c6c3ad"} />
          <circle cx="3" cy="4" r="1" fill="#9ba593" opacity=".65" />
          <path d="M12 10l4 2" stroke="#d7d5c5" strokeWidth="2" />
        </pattern>
        <pattern
          id={`exc-${id}`}
          width="12"
          height="12"
          patternUnits="userSpaceOnUse"
        >
          <rect width="12" height="12" fill={after ? "#b1a28e" : "#c7b696"} />
          <path
            d="M0 12L12 0"
            stroke={after ? "#a39784" : "#b7a685"}
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect
        x="60"
        y="50"
        width="600"
        height="500"
        rx="3"
        fill={`url(#soil-${id})`}
      />
      <path d="M60 490H660M610 50V550" stroke="#697778" strokeWidth="32" />
      <path
        d="M60 490H660M610 50V550"
        stroke="#bcc5c3"
        strokeWidth="1.5"
        strokeDasharray="12 10"
      />
      <rect
        x="90"
        y="80"
        width="90"
        height="55"
        fill="#e7e6de"
        stroke="#8e9790"
        strokeWidth="2"
      />
      <rect x="98" y="88" width="74" height="39" fill="#bcc7c7" />
      <rect
        x="465"
        y="80"
        width="88"
        height="50"
        fill="#e2e5df"
        stroke="#929d96"
        strokeWidth="2"
      />
      <path d="M465 105H553M505 80V130" stroke="#afb9b2" />
      <rect
        x="105"
        y="358"
        width="56"
        height="72"
        fill="#8e9d98"
        stroke="#728780"
      />
      <path
        d="M109 363H155M109 374H155M109 385H155M109 396H155M109 407H155M109 418H155"
        stroke="#bdc8bf"
      />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i}>
          <circle cx={202 + i * 36} cy="69" r="10" fill="#728e6b" />
          <circle cx={204 + i * 36} cy="65" r="7" fill="#849e74" />
        </g>
      ))}
      <rect
        x="235"
        y="175"
        width="250"
        height="250"
        fill={`url(#exc-${id})`}
        stroke="#49636b"
        strokeWidth="5"
      />
      {after ? (
        <>
          <rect x="253" y="193" width="214" height="214" fill="#81766a" />
          <rect x="265" y="205" width="190" height="190" fill="#b7aa91" />
          {[230, 280, 330, 380].map((y) => (
            <g key={y}>
              <line
                x1="248"
                y1={y}
                x2="472"
                y2={y}
                stroke="#657f86"
                strokeWidth="6"
              />
              <line
                x1="248"
                y1={y - 2}
                x2="472"
                y2={y - 2}
                stroke="#aebcbc"
                strokeWidth="2"
              />
            </g>
          ))}
          <path
            d="M427 347q-22 12-18 29q9 16 30 9q21-13 7-25Z"
            fill="#6c9195"
            opacity=".9"
          />
          <rect x="274" y="217" width="36" height="12" fill="#c89242" />
          <circle cx="281" cy="232" r="5" fill="#5f6159" />
          <circle cx="303" cy="232" r="5" fill="#5f6159" />
        </>
      ) : (
        <>
          <path
            d="M251 192L467 408M467 192L251 408"
            stroke="#bbaa8b"
            strokeWidth="11"
          />
          <path d="M249 400H470" stroke="#e5d8b9" strokeWidth="25" />
          <rect x="368" y="237" width="43" height="13" fill="#d39b42" />
          <circle cx="375" cy="254" r="6" fill="#5e675e" />
          <circle cx="405" cy="254" r="6" fill="#5e675e" />
        </>
      )}
      <path
        d="M220 165H500V440H220Z"
        fill="none"
        stroke="#f4eee0"
        strokeWidth="2"
        strokeDasharray="7 5"
      />
      <rect x="340" y="454" width="100" height="18" fill="#e6e8df" />
      <path
        d="M350 457V469M367 457V469M384 457V469M401 457V469M418 457V469"
        stroke="#859892"
        strokeWidth="3"
      />
    </g>
  );
}

export default function ImageComparison({
  records,
  onSave,
  notify,
}: FeatureProps) {
  const [draft, setDraft, { ready, error, retry }] = useDraft(
    "field-imagery-v1",
    {
      divider: 50,
      x: "76",
      y: "36",
      note: "동측 굴착 구간의 배수 상태를 다음 회차에서 다시 확인합니다.",
    },
  );
  const [saving, setSaving] = useState(false);
  const clipId = useId().replace(/:/g, "");
  const annotations = records.filter(
    (r) => r.stage === "construction" && r.payload.kind === "image_annotation",
  );
  const x = Number(draft.x),
    y = Number(draft.y);
  const valid =
    draft.x !== "" &&
    draft.y !== "" &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    x <= 120 &&
    y >= 0 &&
    y <= 100;
  const save = async () => {
    if (!valid || !draft.note.trim()) {
      notify("구역 안의 좌표와 주석 내용을 입력해 주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        stage: "construction",
        title: "회차 영상 현장 확인 메모",
        summary: draft.note,
        status: "pending",
        origin: "synthetic",
        asset_id: "a01-excavation-imagery",
        source_id: "synthetic-a-plan-comparison-v1",
        source_revision: "1",
        method_version: "synthetic-plan-comparison-v1",
        assumptions: [
          "합성 평면영상이며 실제 드론 촬영자료가 아닙니다.",
          "2D 비교 메모이며 침하량 또는 구조물 변위를 산정하지 않습니다.",
        ],
        payload: {
          kind: "image_annotation",
          note: draft.note,
          location: { x, y, frame: "local-synthetic-meters" },
          epochs: ["2026-09-14", "2026-09-21"],
          observation: "추가 확인 필요",
        },
      });
      notify("영상 주석을 A-01 구역 이력에 저장했습니다.", "success");
    } catch {
      notify("주석을 저장하지 못했습니다. 다시 시도해 주세요.", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="field-imagery">
      {error && (
        <div className="notice notice-error" role="alert">
          영상 주석의 자동 보관에 문제가 있습니다. {error}
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
      <div className="field-image-info">
        <div>
          <h2>같은 구역, 두 회차의 기록</h2>
          <p>
            가운데 경계를 움직여 시공 상태를 비교하고 확인할 위치를 표시합니다.
          </p>
        </div>
        <span className="field-source-pill">
          합성 평면영상 · 실제 촬영 아님
        </span>
      </div>
      <div className="field-image-layout">
        <section className="panel field-map-panel">
          <div className="field-map-dates">
            <span>
              <b>회차 1</b>2026.09.14
            </span>
            <span>
              <b>회차 2</b>2026.09.21
            </span>
          </div>
          <div className="field-plan-map">
            <svg
              viewBox="0 0 720 600"
              role="img"
              aria-label="합성 A현장의 두 회차 평면영상. 비교 슬라이더로 회차를 선택하고 지도 위치를 클릭해 주석을 남깁니다."
              onClick={(event) => {
                const svg = event.currentTarget;
                const point = svg.createSVGPoint();
                point.x = event.clientX;
                point.y = event.clientY;
                const matrix = svg.getScreenCTM();
                if (!matrix) return;
                const local = point.matrixTransform(matrix.inverse());
                const worldX = (local.x - 60) / 5,
                  worldY = (550 - local.y) / 5;
                if (
                  worldX >= 0 &&
                  worldX <= 120 &&
                  worldY >= 0 &&
                  worldY <= 100
                )
                  setDraft((v) => ({
                    ...v,
                    x: worldX.toFixed(1),
                    y: worldY.toFixed(1),
                  }));
              }}
            >
              <defs>
                <clipPath id={clipId}>
                  <rect
                    x="60"
                    y="50"
                    width={(600 * draft.divider) / 100}
                    height="500"
                  />
                </clipPath>
              </defs>
              <rect width="720" height="600" fill="#f1f4f2" />
              <Scene after />
              <g clipPath={`url(#${clipId})`}>
                <Scene after={false} />
              </g>
              {[0, 20, 40, 60, 80, 100, 120].map((v) => (
                <g key={`e${v}`}>
                  <text
                    x={60 + v * 5}
                    y="575"
                    fontSize="15"
                    fill="#60706b"
                    textAnchor="middle"
                  >
                    {v}
                  </text>
                  <line
                    x1={60 + v * 5}
                    x2={60 + v * 5}
                    y1="550"
                    y2="555"
                    stroke="#a7b2ac"
                  />
                </g>
              ))}
              {[0, 20, 40, 60, 80, 100].map((v) => (
                <text
                  key={`n${v}`}
                  x="45"
                  y={555 - v * 5}
                  textAnchor="end"
                  fontSize="15"
                  fill="#60706b"
                >
                  {v}
                </text>
              ))}
              <text
                x="660"
                y="597"
                fontSize="15"
                textAnchor="end"
                fill="#60706b"
              >
                E (m) · 현장 로컬 좌표
              </text>
              <path
                d="M680 78V48M672 59L680 43L688 59"
                stroke="#3f5955"
                strokeWidth="2"
                fill="none"
              />
              <text
                x="680"
                y="32"
                fontSize="15"
                textAnchor="middle"
                fill="#3f5955"
              >
                N
              </text>
              <rect
                x="253"
                y="146"
                width="214"
                height="24"
                rx="4"
                fill="#fcfcf8"
                fillOpacity=".94"
              />
              <text
                x="360"
                y="163"
                textAnchor="middle"
                fontSize="14"
                fontWeight="600"
                fill="#385153"
              >
                A-01 · 굴착 50 × 50 m
              </text>
              <line
                x1={60 + (600 * draft.divider) / 100}
                x2={60 + (600 * draft.divider) / 100}
                y1="50"
                y2="550"
                stroke="#fff"
                strokeWidth="4"
              />
              {annotations.map((r) => {
                const loc = r.payload.location as { x: number; y: number };
                return (
                  loc && (
                    <g key={r.id}>
                      <circle
                        cx={60 + loc.x * 5}
                        cy={550 - loc.y * 5}
                        r="10"
                        fill="#fff"
                        stroke="#1767dc"
                        strokeWidth="3"
                      />
                      <circle
                        cx={60 + loc.x * 5}
                        cy={550 - loc.y * 5}
                        r="3.5"
                        fill="#1767dc"
                      />
                      <title>{r.summary}</title>
                    </g>
                  )
                );
              })}
              {valid && (
                <g>
                  <circle
                    cx={60 + x * 5}
                    cy={550 - y * 5}
                    r="14"
                    fill="#1767dc"
                    fillOpacity=".15"
                    stroke="#1767dc"
                    strokeWidth="2"
                  />
                  <path
                    d={`M${60 + x * 5 - 7} ${550 - y * 5}h14M${60 + x * 5} ${550 - y * 5 - 7}v14`}
                    stroke="#1767dc"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>
          </div>
          <div className="field-divider-control">
            <MoveHorizontal size={18} />
            <label htmlFor="field-compare-range">회차 비교 경계</label>
            <input
              id="field-compare-range"
              type="range"
              min="0"
              max="100"
              value={draft.divider}
              disabled={!ready}
              onChange={(e) =>
                setDraft((v) => ({ ...v, divider: Number(e.target.value) }))
              }
            />
            <span>{draft.divider}%</span>
          </div>
          <div className="field-map-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setDraft((v) => ({ ...v, divider: 100 }))}
            >
              회차 1만 보기
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setDraft((v) => ({ ...v, divider: 50 }))}
            >
              절반 비교
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => setDraft((v) => ({ ...v, divider: 0 }))}
            >
              회차 2만 보기
            </button>
          </div>
        </section>
        <aside className="panel field-map-note">
          <div className="panel-header">
            <h2>
              <MapPin size={18} />
              확인할 위치
            </h2>
          </div>
          <p className="muted">지도를 클릭하거나 로컬 좌표를 입력하세요.</p>
          <div className="field-coordinate-grid">
            <label className="field">
              E (m)
              <input
                type="number"
                min="0"
                max="120"
                step="0.1"
                value={draft.x}
                onChange={(e) => setDraft((v) => ({ ...v, x: e.target.value }))}
              />
            </label>
            <label className="field">
              N (m)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={draft.y}
                onChange={(e) => setDraft((v) => ({ ...v, y: e.target.value }))}
              />
            </label>
          </div>
          {!valid && (
            <p className="field-danger-text">
              E 0~120 m, N 0~100 m 범위로 입력해 주세요.
            </p>
          )}
          <label className="field">
            관찰·확인 메모
            <textarea
              rows={5}
              value={draft.note}
              onChange={(e) =>
                setDraft((v) => ({ ...v, note: e.target.value }))
              }
            />
          </label>
          <button
            className="btn btn-primary field-save-btn"
            disabled={saving || !ready || !valid}
            onClick={save}
          >
            <Save size={16} />
            {saving ? "저장 중…" : "구역 주석 저장"}
          </button>
          <p className="field-help">
            색·형상 차이는 관찰 메모입니다. 이 비교로 침하량이나 구조물 변위를
            산정하지 않습니다.
          </p>
          <div className="field-map-note-list">
            <h3>
              저장한 주석 <span>{annotations.length}</span>
            </h3>
            {annotations.length ? (
              annotations.slice(0, 4).map((r) => (
                <article key={r.id}>
                  <span>추가 확인 필요</span>
                  <p>{r.summary}</p>
                </article>
              ))
            ) : (
              <p className="muted">위치를 선택해 첫 주석을 남겨 보세요.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
