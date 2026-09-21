import { useMemo, useState } from "react";
import { ArrowUpRight, Link2, Search } from "lucide-react";
import type { FeatureProps } from "../contracts";

const refs = [
  {
    id: "kds-2020",
    title: "가설흙막이 설계기준",
    code: "KDS 21 30 00:2020",
    subject: "안전율",
    page: 94,
    pages: "94 · 127 · 160",
    detail: "계산서는 지지력 2.0, 앵커 1.5, 근입장 1.2의 안전율을 채택합니다.",
    note: "계산서의 채택판과 실제 적용값입니다. 다른 판본의 적합성을 자동 확정하지 않습니다.",
  },
  {
    id: "kcs-monitoring",
    title: "시공중 지반계측",
    code: "KCS 11 10 15:2018",
    subject: "변위",
    page: 94,
    pages: "94 · 127 · 160",
    detail:
      "H-Pile과 토류판으로 구성된 연성벽체의 허용 수평변위로 0.003H를 적용합니다.",
    note: "H는 선택 단면의 검토 굴착깊이입니다. D-D′ 원문 깊이 불일치는 설계 화면에서 확인합니다.",
  },
  {
    id: "timber",
    title: "토류판 휨·전단",
    code: "계산서 · KDS 21 30 00(2020) 인용",
    subject: "토류판",
    page: 106,
    pages: "106 · 139 · 169",
    detail:
      "침엽수 허용휨 13.5 MPa, 허용전단 1.05 MPa. 지간 L=s−3b/4, 휨모멘트 M=wL²/8.",
    note: "면압 p와 판높이를 반영한 선하중 w를 구별합니다. 계산서 원문과 선택한 제원으로 대조합니다.",
  },
  {
    id: "anchor",
    title: "어스앵커 인장·정착 검토",
    code: "계산서 · 일시앵커",
    subject: "앵커",
    page: 95,
    pages: "95–98 · 128–131 · 161–164",
    detail:
      "허용인장력 min(0.65fpu, 0.80fpy), 활동·릴랙세이션 손실, 정착 안전율 1.5와 채택 정착장을 확인합니다.",
    note: "별도 기준 조항 번호는 원문에 명확히 기재되지 않아 생성하지 않았습니다.",
  },
  {
    id: "wale",
    title: "띠장 연속보 검토",
    code: "계산서 · 앵커 초기긴장력 연결",
    subject: "띠장",
    page: 99,
    pages: "99–103 · 132–136 · 165–166",
    detail: "R=Jf·cosθ·(c/a), θ=35°. 가설·부식계수 1.5×0.9를 채택합니다.",
    note: "Jf는 앵커 1개소의 손실 포함 하중이며 단위폭 최대반력과 다릅니다.",
  },
  {
    id: "pile",
    title: "H-Pile 응력·지지력 검토",
    code: "계산서 · 허용응력 검토",
    subject: "H-Pile",
    page: 104,
    pages: "104–105 · 137–138 · 167–168",
    detail:
      "축·휨·전단·합성응력과 변위를 검토하며 채택 극한지지력 Qu를 Fs로 나눠 Qa를 계산합니다.",
    note: "p25의 도로교시방서 강교편 언급에는 판연도가 없어 별도 확인 대상으로 보존합니다.",
  },
  {
    id: "settlement",
    title: "배면침하 원문 검토",
    code: "Caspe (1966)",
    subject: "침하",
    page: 118,
    pages: "118 · 151 · 179",
    detail: "계산서에 수록된 배면침하 추정의 조건과 결과를 확인합니다.",
    note: "이 항목은 원문 검토입니다. 부재 입력을 바꾸어도 침하 해석을 새로 실행하지 않습니다.",
  },
  {
    id: "foundation",
    title: "기초 지지력·침하의 인용 근거",
    code: "구조물기초설계기준 · 계산서 인용",
    subject: "기초",
    page: 182,
    pages: "182–185",
    detail:
      "Terzaghi·Meyerhof·Hansen·Bowles 및 Schmertmann & Hartman(1978), TRB(1991)를 인용합니다.",
    note: "계산서의 기준 판연도는 미기재입니다. 제공된 2015 해설서를 이 계산서의 채택판으로 임의 연결하지 않습니다.",
  },
  {
    id: "drainage",
    title: "영구배수 유속계수 근거",
    code: "SDS · Hazen-Williams",
    subject: "배수",
    page: 254,
    pages: "254–255",
    detail:
      "유속계수 출처로 토지공사의 ‘제1편 설계기준 제5장 상수도공사’를 인용합니다.",
    note: "원문에 인용연도가 없어 최신판 여부는 확인되지 않았습니다.",
  },
];

export default function ProjectReferences({ onSave, notify }: FeatureProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(refs[0]);
  const [saving, setSaving] = useState(false);
  const found = useMemo(
    () =>
      refs.filter((r) =>
        `${r.title} ${r.code} ${r.subject}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  );
  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        stage: "tender",
        title: `${active.subject} · 계산서 채택근거`,
        summary: `${active.code} · PDF ${active.pages}쪽`,
        status: "pending",
        origin: "imported_analysis",
        source_id: "design-calculation",
        source_revision: "provided-document-v1",
        method_version: "source-reference-review-1",
        assumptions: [active.note],
        payload: {
          kind: "standard-adoption",
          reference_id: active.id,
          code: active.code,
          pdf_page: active.page,
          source_url: `/documents/design-calculation.pdf#page=${active.page}`,
          adopted_basis: active.detail,
          adoption_status: "review-required",
        },
      });
      notify("계산서의 채택근거를 현장 검토에 연결했습니다.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "저장하지 못했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="project-references panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">PROJECT DESIGN BASIS</span>
          <h2>이 현장 계산서는 무엇을 근거로 했나요?</h2>
          <p className="muted">
            원문이 채택한 판본·식·값을 먼저 확인합니다. 아래 공식 고시 정보와
            구분해 검토하세요.
          </p>
        </div>
      </div>
      <div className="project-reference-layout">
        <div>
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="계산서 근거 검색"
              placeholder="부재, 기준, 검토 항목"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="project-reference-list">
            {found.map((r) => (
              <button
                key={r.id}
                className={r.id === active.id ? "active" : ""}
                onClick={() => setActive(r)}
              >
                <span>{r.subject}</span>
                <strong>{r.title}</strong>
                <small>{r.code}</small>
              </button>
            ))}
            {!found.length && (
              <p className="muted">일치하는 원문 근거가 없습니다.</p>
            )}
          </div>
        </div>
        <div className="project-reference-detail">
          <span className="code-label">{active.code}</span>
          <h3>{active.title}</h3>
          <p>{active.detail}</p>
          <div className="notice">{active.note}</div>
          <dl className="record-meta">
            <div>
              <dt>근거 문서</dt>
              <dd>이천자이더리체 흙막이 계산서</dd>
            </div>
            <div>
              <dt>PDF 쪽</dt>
              <dd>{active.pages}</dd>
            </div>
          </dl>
          <div className="modal-actions">
            <a
              className="btn btn-secondary"
              href={`/documents/design-calculation.pdf#page=${active.page}`}
              target="_blank"
              rel="noreferrer"
            >
              원문 근거 보기 <ArrowUpRight size={15} />
            </a>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={saving}
            >
              <Link2 size={15} />
              {saving ? "연결 중…" : "검토 근거로 연결"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
