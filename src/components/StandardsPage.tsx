import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Link2,
  Search,
} from "lucide-react";
import type { FeatureProps } from "../contracts";
const NOTICE =
  "https://www.codil.or.kr/filebank/moct2014/202409/MOCT3217_0.PDF?nserialno=3217";
const catalog = [
  {
    code: "KDS 21 30 00",
    name: "가설흙막이 설계기준",
    type: "KDS",
    category: "흙막이 설계",
    edition: "2024",
    revised: "2024-09-27",
    scope: "흙막이 부재와 가시설 설계에서 적용할 기준의 판본을 확인합니다.",
    keywords: "흙막이 앵커 띠장 H-Pile 토류판 설계",
    page: "개정 고시 1쪽 · 1. 건명",
    detail:
      "국토교통부고시 제2024-511호의 부분 개정 대상에 포함된 코드입니다. 본문 조항과 현장 적용 조건은 공식 원문에서 별도로 확인해야 합니다.",
  },
  {
    code: "KCS 21 30 00",
    name: "가설흙막이 공사",
    type: "KCS",
    category: "흙막이 시공",
    edition: "2024",
    revised: "2024-09-27",
    scope:
      "흙막이 시공·품질 검토에 사용할 시방서의 판본과 적용 조건을 확인합니다.",
    keywords: "흙막이 시공 품질 계측 공사",
    page: "개정 고시 1쪽 · 1. 건명",
    detail:
      "동일 고시에서 부분 개정 대상인 가설공사 표준시방서로 확인됩니다. 시험별 판정기준을 이 고시만으로 자동 채택하지 않습니다.",
  },
  {
    code: "KDS 21 10 00",
    name: "가시설물 설계 일반사항",
    type: "KDS",
    category: "설계 일반",
    edition: "2024",
    revised: "2024-09-27",
    scope:
      "가시설물의 설계 검토를 시작하기 전에 관련 일반사항과 채택판을 확인합니다.",
    keywords: "가시설 설계 일반사항 구조 검토",
    page: "개정 고시 1쪽 · 1. 건명",
    detail:
      "동일 고시에서 부분 개정 대상으로 확인되는 일반사항입니다. 세부 조항은 이 라이브러리의 메타데이터에 포함되지 않았습니다.",
  },
];
export default function StandardsPage({
  records,
  onSave,
  notify,
}: FeatureProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [active, setActive] = useState(catalog[0]);
  const [edition, setEdition] = useState("2024");
  const [clause, setClause] = useState("");
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const found = useMemo(
    () =>
      catalog.filter(
        (s) =>
          (filter === "all" || s.type === filter) &&
          `${s.code} ${s.name} ${s.keywords}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [search, filter],
  );
  const linked = records.filter((r) => r.payload.kind === "standard-adoption");
  const save = async () => {
    if (!edition.trim()) {
      notify("현장에서 검토할 판본을 입력해주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        stage: "tender",
        title: `${active.code} 적용판 검토`,
        status: "pending",
        origin: "official_reference",
        summary: `검토판 ${edition} · ${clause || "본문 조항 확인 필요"}`,
        source_id: `official-${active.code.replaceAll(" ", "-")}`,
        source_revision: active.revised,
        method_version: "standard-metadata-1",
        assumptions: [
          "개정 고시에서 코드·이름·개정일 확인",
          "최신판 확정 또는 현장 적합성 검증을 의미하지 않음",
        ],
        payload: {
          kind: "standard-adoption",
          code: active.code,
          name: active.name,
          edition,
          clause: clause || null,
          memo,
          official_url: NOTICE,
          metadata_page: active.page,
          verified_scope: "amendment-notice-metadata",
          latest_status: "unverified",
          adoption_status: "review-required",
        },
      });
      notify("적용판 검토를 현장 이력에 연결했습니다.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="standards-layout">
      <section className="panel standard-list">
        <div className="panel-header">
          <h2>
            선정 기준 <span className="muted">{catalog.length}</span>
          </h2>
          <BookOpen size={20} />
        </div>
        <label className="search-input">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="기준 코드, 이름, 키워드"
            aria-label="건설기준 검색"
          />
        </label>
        <div className="section-tabs" role="group" aria-label="기준 종류">
          {[
            ["all", "전체"],
            ["KDS", "설계기준 KDS"],
            ["KCS", "시방서 KCS"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "active" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          {found.length ? (
            found.map((s) => (
              <button
                className={`standard-item ${s.code === active.code ? "selected" : ""}`}
                key={s.code}
                onClick={() => {
                  setActive(s);
                  setEdition(s.edition);
                  setClause("");
                  setMemo("");
                }}
              >
                <div>
                  <span className="code-label">{s.code}</span>
                  <span className="badge badge-neutral">{s.type}</span>
                </div>
                <h3>{s.name}</h3>
                <p>
                  {s.category} · 확인판 {s.edition}
                </p>
                <span className="standard-date">고시 확인 {s.revised}</span>
              </button>
            ))
          ) : (
            <div className="empty-state">
              <Search />
              <h3>검색 결과가 없습니다</h3>
              <p>등록된 3개 기준의 코드와 이름에서 검색합니다.</p>
            </div>
          )}
        </div>
        <div className="notice">
          선정 기준의 메타데이터입니다. 전국 기준 전체를 동기화하거나 최신판을
          자동 확정하지 않습니다.
        </div>
      </section>
      <section className="panel standard-detail">
        <div className="eyebrow">OFFICIAL REFERENCE</div>
        <span className="code-label">{active.code}</span>
        <h2>{active.name}</h2>
        <p className="standard-scope">{active.scope}</p>
        <dl className="record-meta">
          <div>
            <dt>확인한 판본</dt>
            <dd>{active.edition} · 부분 개정</dd>
          </div>
          <div>
            <dt>개정 고시일</dt>
            <dd>{active.revised}</dd>
          </div>
          <div>
            <dt>공식 출처</dt>
            <dd>국토교통부 · CODIL 고시 원문</dd>
          </div>
          <div>
            <dt>확인 위치</dt>
            <dd>{active.page}</dd>
          </div>
        </dl>
        <div className="notice notice-warning">
          <FileText size={18} />
          <span>{active.detail}</span>
        </div>
        <div className="standard-links">
          <a
            className="btn btn-secondary"
            href={NOTICE}
            target="_blank"
            rel="noreferrer"
          >
            공식 개정 고시 <ArrowUpRight size={16} />
          </a>
          <a
            className="text-link"
            href="https://www.kcsc.re.kr/"
            target="_blank"
            rel="noreferrer"
          >
            국가건설기준센터 <ArrowUpRight size={15} />
          </a>
        </div>
        <div className="standard-adoption">
          <h3>
            <Link2 size={18} /> 현장 검토와 연결
          </h3>
          <p className="muted">
            공식 원문을 확인한 후 채택할 판본과 조항을 기록하세요.
          </p>
          <div className="field-grid">
            <label className="field">
              <span>
                검토할 판본 <b>*</b>
              </span>
              <input
                value={edition}
                onChange={(e) => setEdition(e.target.value)}
                aria-label="현장 검토판"
              />
            </label>
            <label className="field">
              <span>확인한 본문 조항</span>
              <input
                value={clause}
                onChange={(e) => setClause(e.target.value)}
                placeholder="미입력 시 확인 필요"
              />
            </label>
          </div>
          <label className="field">
            <span>적용 조건과 검토 의견</span>
            <textarea
              rows={3}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="이번 구역에서 확인할 조건을 기록하세요."
            />
          </label>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <CheckCircle2 size={16} />
            {saving ? "연결 중…" : "A-01 검토 이력에 연결"}
          </button>
          <p className="muted small">
            현재 연결된 기준 검토 {linked.length}건 · 판정 보류로 기록됩니다.
          </p>
        </div>
      </section>
    </div>
  );
}
