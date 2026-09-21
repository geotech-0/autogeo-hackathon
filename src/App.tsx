import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ComponentType } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderOpen,
  History,
  Layers3,
  LayoutDashboard,
  MapPin,
  Menu,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import type {
  FeatureProps,
  ProjectRecord,
  ProjectRecordDraft,
} from "./contracts";
import { SITE, STAGE_LABELS, STATUS_LABELS } from "./contracts";
import {
  exportProject,
  importProject,
  initializeRecords,
  listRecords,
  listRevisions,
  resetProject,
  saveRecord,
} from "./storage/database";
import { SEED_RECORDS } from "./data/seed";
import ScenePreview from "./components/ScenePreview";
import ErrorBoundary from "./components/ErrorBoundary";
import StandardsPage from "./components/StandardsPage";
const modules = import.meta.glob("./features/**/*Page.tsx");
function feature(path: string) {
  return modules[path]
    ? lazy(
        modules[path] as () => Promise<{
          default: ComponentType<FeatureProps>;
        }>,
      )
    : () => (
        <section className="panel empty-state">
          <Layers3 size={32} />
          <h2>업무 화면을 준비하고 있습니다</h2>
          <p>각 기능을 순서대로 연결하고 있습니다.</p>
        </section>
      );
}
const DesignPage = feature("./features/design/DesignPage.tsx");
const GroundPage = feature("./features/ground/GroundPage.tsx");
const FieldPage = feature("./features/field/FieldPage.tsx");
const MaintenancePage = feature("./features/maintenance/MaintenancePage.tsx");
type Page =
  | "overview"
  | "tender"
  | "design"
  | "construction"
  | "maintenance"
  | "history"
  | "standards";
const NAV = [
  { id: "overview", name: "현장 개요", icon: LayoutDashboard },
  { id: "tender", name: "입찰 · 지반 모델", icon: Layers3, n: "01" },
  { id: "design", name: "설계 · 부재 검토", icon: ClipboardCheck, n: "02" },
  { id: "construction", name: "시공 · 품질 관리", icon: Building2, n: "03" },
  { id: "maintenance", name: "유지관리 · 조사", icon: ShieldCheck, n: "04" },
  { id: "history", name: "통합 검토 이력", icon: History },
  { id: "standards", name: "건설기준 라이브러리", icon: BookOpen },
] as const;
const PAGE_META: Record<Page, [string, string]> = {
  overview: ["현장 개요", "하나의 현장, 이어지는 근거와 기록"],
  tender: [
    "지반을 이해하는 첫 단계",
    "시추공과 지층 모델에서 현장의 조건을 확인하세요.",
  ],
  design: [
    "근거를 따라가는 부재 검토",
    "입력부터 계산서까지, 검토 과정을 한 단계씩 확인하세요.",
  ],
  construction: [
    "데이터로 확인하는 현장 품질",
    "시험과 계측의 변화를 살펴보고 필요한 조치를 연결하세요.",
  ],
  maintenance: [
    "조사에서 조치, 다시 확인까지",
    "같은 위치의 조사 근거와 후속 이력을 이어서 관리하세요.",
  ],
  history: [
    "모든 검토를 한 곳에서",
    "A-01 구역의 입력, 결과, 판단과 조치가 연결됩니다.",
  ],
  standards: [
    "건설기준 라이브러리",
    "기준의 판본과 공식 출처를 확인하고 현장 검토에 연결하세요.",
  ],
};
function initialPage(): Page {
  const route = location.pathname.split("/").filter(Boolean)[0];
  return NAV.some((n) => n.id === route) ? (route as Page) : "overview";
}
function fmtDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [page, setPage] = useState<Page>(initialPage);
  const [records, setRecords] = useState<ProjectRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dbError, setDbError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(
    null,
  );
  const [help, setHelp] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [historyStage, setHistoryStage] = useState("all");
  const [selected, setSelected] = useState<ProjectRecord | null>(null);
  const [versions, setVersions] = useState<ProjectRecord[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const notify = useCallback(
    (message: string, tone: "success" | "error" | "info" = "success") => {
      setToast({ message, tone });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 5000);
    },
    [],
  );
  useEffect(() => {
    initializeRecords(SEED_RECORDS)
      .then(listRecords)
      .then(setRecords)
      .catch((e) => setDbError(String(e.message || e)))
      .finally(() => setLoaded(true));
    return () => clearTimeout(toastTimer.current);
  }, [epoch]);
  useEffect(() => {
    if (!selected) {
      setVersions([]);
      return;
    }
    listRevisions(selected.id)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [selected?.id]);
  const navigate = useCallback((next: Page) => {
    setPage(next);
    setMenuOpen(false);
    setSiteOpen(false);
    history.pushState(null, "", next === "overview" ? "/" : `/${next}`);
    document.querySelector(".main-scroll")?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const pop = () => setPage(initialPage());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHelp(false);
        setResetOpen(false);
        setSelected(null);
        setMenuOpen(false);
        setSiteOpen(false);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!help && !selected && !resetOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const modal = document.querySelector<HTMLElement>(".modal");
    if (!modal) return;
    const focusable = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]',
        ),
      ).filter((el) => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [Boolean(help || selected || resetOpen)]);
  const onSave = useCallback(
    async (draft: ProjectRecordDraft) => {
      try {
        const record = await saveRecord(draft);
        setRecords(await listRecords());
        return record;
      } catch (e) {
        notify(
          e instanceof Error ? e.message : "기록을 저장하지 못했습니다.",
          "error",
        );
        throw e;
      }
    },
    [notify],
  );
  const props: FeatureProps = { records, onSave, notify };
  const filtered = records.filter(
    (r) =>
      (historyStage === "all" || r.stage === historyStage) &&
      `${r.title} ${r.summary} ${r.zone_id} ${r.source_id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const exportAll = async () => {
    try {
      download("AutoGeo-A현장-검토이력.json", await exportProject());
      notify(
        "저장한 현장 기록을 내보냈습니다. 작성 중인 입력은 먼저 저장해주세요.",
      );
    } catch (e) {
      notify(String(e), "error");
    }
  };
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("10MB 이하의 AutoGeo JSON 파일을 선택해주세요.");
      const count = await importProject(JSON.parse(await file.text()));
      setRecords(await listRecords());
      notify(
        `${count}개 기록을 추가·갱신했습니다. 기존 최신 개정은 유지합니다.`,
      );
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "파일을 읽지 못했습니다.",
        "error",
      );
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const saveNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await onSave({
        stage: "tender",
        title: "A-01 검토 의견",
        summary: note.trim(),
        status: "draft",
        payload: { kind: "comment", content: note.trim() },
      });
      setNote("");
      notify("검토 의견을 기록했습니다.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <header className="global-header">
        <div className="brand-lockup">
          <button
            className="icon-btn mobile-menu"
            aria-label="메뉴 열기"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={22} />
          </button>
          <img src="/brand/gs-enc.svg" alt="GS건설" />
          <span className="brand-divider" />
          <strong>
            AutoGeo<span className="brand-dot">.</span>
          </strong>
        </div>
        <div className="header-breadcrumb">
          <span>프로젝트</span>
          <ChevronRight size={14} />
          <strong>A현장</strong>
        </div>
        <div className="header-right">
          <span className="demo-label">HACKATHON DEMO</span>
          <button
            className="icon-btn"
            aria-label="사용 안내"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={20} />
          </button>
          <span className="profile-avatar">A</span>
          <span className="profile-name">현장 검토자</span>
        </div>
      </header>
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="site-selector">
          <button
            onClick={() => setSiteOpen(!siteOpen)}
            aria-expanded={siteOpen}
          >
            <span className="site-mark">
              <Building2 size={20} />
            </span>
            <span>
              <small>현재 프로젝트</small>
              <strong>A 지반개발 현장</strong>
            </span>
            <ChevronDown size={16} />
          </button>
          {siteOpen && (
            <div className="site-dropdown">
              <button
                onClick={() => {
                  setSiteOpen(false);
                  navigate("overview");
                }}
              >
                <Check size={16} /> A현장 · 합성 시연
              </button>
              <p>검토 이력은 이 브라우저에 저장됩니다.</p>
            </div>
          )}
        </div>
        <div className="nav-caption">PROJECT WORKSPACE</div>
        <nav aria-label="주요 업무">
          {NAV.map((item, i) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""} ${i === 5 ? "nav-separator" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>{item.name}</span>
              {"n" in item && <small>{item.n}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className="status-dot" />
            <span>브라우저에 기록 보관</span>
          </div>
          <button className="sidebar-export" onClick={exportAll}>
            <ArrowDownToLine size={16} /> 이력 내보내기
          </button>
          <p>
            합성 A현장 · 해커톤 시제품
            <br />
            공식 운영 서비스가 아닙니다.
          </p>
        </div>
      </aside>
      <div className="main-scroll">
        <main id="main-content" className="main-content">
          {(["overview", "history", "standards"] as Page[]).includes(page) && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span>AUTOGEO WORKSPACE</span>
                  <i />
                  A-01
                </div>
                <h1>{PAGE_META[page][0]}</h1>
                <p>{PAGE_META[page][1]}</p>
              </div>
              <div className="heading-actions">
                <span className="badge badge-neutral">
                  <span className="small-dot" /> 합성 현장 예제
                </span>
                {page === "overview" && (
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate("tender")}
                  >
                    대표 시연 시작 <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>
          )}
          {dbError && (
            <div className="notice notice-error" role="alert">
              {dbError}{" "}
              <button onClick={() => location.reload()}>다시 시도</button>
            </div>
          )}
          {!loaded ? (
            <div className="panel skeleton" aria-busy="true">
              <p>현장 기록을 불러오고 있습니다.</p>
            </div>
          ) : page === "overview" ? (
            <>
              <div className="overview-grid">
                <section className="panel overview-project">
                  <div className="panel-header">
                    <div>
                      <div className="eyebrow">PROJECT A</div>
                      <h2>A 지반개발 프로젝트</h2>
                      <p className="muted">
                        <MapPin size={14} /> A-01 굴착 구역 · 시연용 로컬 좌표
                      </p>
                    </div>
                    <span className="badge badge-blue">통합 검토</span>
                  </div>
                  <button
                    className="scene-preview-button"
                    onClick={() => navigate("tender")}
                    aria-label="A현장 지반 모델 열기"
                  >
                    <ScenePreview />
                    <span className="scene-open">
                      지반 모델 살펴보기 <ArrowRight size={15} />
                    </span>
                  </button>
                  <div className="project-metrics">
                    <div>
                      <span>현장 면적</span>
                      <strong>
                        12,000 <small>m²</small>
                      </strong>
                    </div>
                    <div>
                      <span>합성 시추공</span>
                      <strong>
                        12 <small>공</small>
                      </strong>
                    </div>
                    <div>
                      <span>계획 굴착</span>
                      <strong>
                        10.0 <small>m</small>
                      </strong>
                    </div>
                  </div>
                </section>
                <section className="panel review-focus">
                  <div className="panel-header">
                    <div>
                      <div className="eyebrow">REVIEW FOCUS</div>
                      <h2>지금 확인할 항목</h2>
                    </div>
                    <span className="count-pill">
                      {
                        records.filter((r) =>
                          ["pending", "exceeded", "stale", "action"].includes(
                            r.status,
                          ),
                        ).length
                      }
                    </span>
                  </div>
                  <p className="muted focus-description">
                    자료의 근거를 확인하고 검토 결과를 남겨주세요.
                  </p>
                  <div className="focus-list">
                    {!records.some((r) =>
                      ["pending", "exceeded", "stale", "action"].includes(
                        r.status,
                      ),
                    ) &&
                      [
                        {
                          page: "tender" as const,
                          title: "시추공과 굴착영역 살펴보기",
                          sub: "입찰 · 12공 합성 예제",
                        },
                        {
                          page: "design" as const,
                          title: "입력을 바꿔 부재 검토하기",
                          sub: "설계 · 단계별 계산 근거",
                        },
                        {
                          page: "construction" as const,
                          title: "시험과 계측의 이상 확인하기",
                          sub: "시공 · 정상과 초과 예제",
                        },
                      ].map((r, i) => (
                        <button key={r.page} onClick={() => navigate(r.page)}>
                          <span className={`focus-icon focus-icon-${i}`}>
                            <ClipboardCheck size={19} />
                          </span>
                          <span>
                            <small>{r.sub}</small>
                            <strong>{r.title}</strong>
                            <em>예제로 시작</em>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      ))}
                    {records
                      .filter((r) =>
                        ["pending", "exceeded", "stale", "action"].includes(
                          r.status,
                        ),
                      )
                      .slice(0, 3)
                      .map((r, i) => (
                        <button
                          key={r.id}
                          onClick={() =>
                            navigate(r.stage === "tender" ? "tender" : r.stage)
                          }
                        >
                          <span className={`focus-icon focus-icon-${i}`}>
                            <ClipboardCheck size={19} />
                          </span>
                          <span>
                            <small>
                              {STAGE_LABELS[r.stage]} · {r.zone_id}
                            </small>
                            <strong>{r.title}</strong>
                            <em>{STATUS_LABELS[r.status]}</em>
                          </span>
                          <ChevronRight size={17} />
                        </button>
                      ))}
                  </div>
                  <button
                    className="text-link"
                    onClick={() => navigate("history")}
                  >
                    모든 검토 이력 보기 <ArrowRight size={15} />
                  </button>
                  <div className="focus-footnote">
                    <ShieldCheck size={16} />
                    <span>결과와 출처, 검토 개정을 함께 보관합니다.</span>
                  </div>
                </section>
              </div>
              <section className="workflow-section">
                <div className="section-heading">
                  <div>
                    <h2>현장의 전 과정을 연결합니다</h2>
                    <p>
                      같은 구역의 조건과 판단을 다음 업무에서 이어 확인하세요.
                    </p>
                  </div>
                  <span className="muted">4개 업무 · 하나의 이력</span>
                </div>
                <div className="workflow-cards">
                  {[
                    {
                      page: "tender" as const,
                      n: "01",
                      title: "입찰",
                      sub: "현장의 조건을 파악하다",
                      body: "기준 검색 · 시추 검수 · 지층 모델",
                      icon: Layers3,
                    },
                    {
                      page: "design" as const,
                      n: "02",
                      title: "설계",
                      sub: "검토의 근거를 따라가다",
                      body: "4개 부재 · 단계별 계산 · 대안 비교",
                      icon: ClipboardCheck,
                    },
                    {
                      page: "construction" as const,
                      n: "03",
                      title: "시공",
                      sub: "현장의 변화를 확인하다",
                      body: "시험 데이터 · 계측 · 영상 비교",
                      icon: Building2,
                    },
                    {
                      page: "maintenance" as const,
                      n: "04",
                      title: "유지관리",
                      sub: "조치와 재점검을 이어가다",
                      body: "GPR 해석 · 조치 기록 · 재점검",
                      icon: ShieldCheck,
                    },
                  ].map((x) => (
                    <button
                      className="workflow-card"
                      key={x.page}
                      onClick={() => navigate(x.page)}
                    >
                      <div className="workflow-card-top">
                        <x.icon size={23} />
                        <span>{x.n}</span>
                      </div>
                      <h3>
                        {x.title}
                        <ArrowRight size={17} />
                      </h3>
                      <strong>{x.sub}</strong>
                      <p>{x.body}</p>
                    </button>
                  ))}
                </div>
              </section>
              <section className="panel recent-panel">
                <div className="panel-header">
                  <div>
                    <h2>최근 검토 이력</h2>
                    <p className="muted">
                      입력부터 조치까지, 무엇을 근거로 판단했는지 확인하세요.
                    </p>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => navigate("history")}
                  >
                    전체 보기 <ArrowRight size={15} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>검토 내용</th>
                        <th>업무</th>
                        <th>구역</th>
                        <th>상태</th>
                        <th>최근 변경</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.length === 0 && (
                        <tr>
                          <td colSpan={5}>
                            <div className="empty-state">
                              <p>
                                각 업무에서 검토 결과를 저장하면 근거와 개정
                                이력이 여기에 쌓입니다.
                              </p>
                              <button
                                className="text-link"
                                onClick={() => navigate("design")}
                              >
                                첫 부재 검토 시작 <ArrowRight size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {records.slice(0, 4).map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button
                              className="table-link"
                              onClick={() => setSelected(r)}
                            >
                              <FileText size={16} />
                              {r.title}
                            </button>
                          </td>
                          <td>{STAGE_LABELS[r.stage]}</td>
                          <td>{r.zone_id}</td>
                          <td>
                            <Status status={r.status} />
                          </td>
                          <td className="muted">{fmtDate(r.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : page === "history" ? (
            <>
              <div className="history-toolbar">
                <label className="search-input">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="검토 제목, 구역, 출처 검색"
                    aria-label="검토 이력 검색"
                  />
                </label>
                <select
                  value={historyStage}
                  onChange={(e) => setHistoryStage(e.target.value)}
                  aria-label="업무 필터"
                >
                  <option value="all">모든 업무</option>
                  {Object.entries(STAGE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button
                  className="btn btn-secondary"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={16} /> 가져오기
                </button>
                <button className="btn btn-secondary" onClick={exportAll}>
                  <ArrowDownToLine size={16} /> 내보내기
                </button>
              </div>
              <section className="panel">
                <div className="panel-header">
                  <h2>
                    저장한 현장 기록{" "}
                    <span className="muted">{filtered.length}</span>
                  </h2>
                  <span className="badge badge-neutral">{SITE.zone_id}</span>
                </div>
                {filtered.length ? (
                  <div className="record-list">
                    {filtered.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className="record-row"
                      >
                        <span className="record-mark">
                          <FileText size={20} />
                        </span>
                        <span className="record-main">
                          <small>
                            {STAGE_LABELS[r.stage]} · {r.zone_id} · 개정{" "}
                            {r.revision}
                          </small>
                          <strong>{r.title}</strong>
                          <span>{r.summary}</span>
                        </span>
                        <span className="record-tail">
                          <Status status={r.status} />
                          <small>{fmtDate(r.updated_at)}</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Search />
                    <h3>조건에 맞는 기록이 없습니다</h3>
                    <p>다른 검색어나 업무를 선택해주세요.</p>
                  </div>
                )}
              </section>
              <section className="panel comment-panel">
                <h2>검토 의견 남기기</h2>
                <label className="field">
                  <span>A-01 구역의 검토 의견</span>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="확인한 근거와 후속 조치를 적어주세요."
                  />
                </label>
                <button
                  className="btn btn-primary"
                  disabled={!note.trim() || saving}
                  onClick={saveNote}
                >
                  <Plus size={16} />
                  {saving ? "저장 중…" : "의견 저장"}
                </button>
              </section>
              <button className="reset-link" onClick={() => setResetOpen(true)}>
                <RotateCcw size={14} /> 합성 예제로 초기화
              </button>
            </>
          ) : (
            <ErrorBoundary key={page}>
              <Suspense
                fallback={
                  <div className="panel skeleton" aria-busy="true">
                    업무 화면을 불러오고 있습니다.
                  </div>
                }
              >
                {page === "tender" ? (
                  <GroundPage {...props} />
                ) : page === "design" ? (
                  <DesignPage {...props} />
                ) : page === "construction" ? (
                  <FieldPage {...props} />
                ) : page === "maintenance" ? (
                  <MaintenancePage {...props} />
                ) : (
                  <StandardsPage {...props} />
                )}
              </Suspense>
            </ErrorBoundary>
          )}
          <footer className="page-footer">
            <span>AutoGeo · 현장의 근거를 하나로</span>
            <span>
              합성 데이터 시연 · 저장한 기록은 JSON으로 보관할 수 있습니다
            </span>
          </footer>
        </main>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => importFile(e.target.files?.[0])}
      />
      {toast && (
        <div
          className={`toast toast-${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.tone === "success" ? (
            <CheckCircle2 size={18} />
          ) : (
            <CircleHelp size={18} />
          )}
          <span>{toast.message}</span>
          <button aria-label="알림 닫기" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              aria-label="안내 닫기"
              onClick={() => setHelp(false)}
            >
              <X />
            </button>
            <div className="eyebrow">START HERE</div>
            <h2 id="help-title">A현장으로 시작하는 검토 흐름</h2>
            <ol className="help-steps">
              <li>
                <strong>입찰에서 현장 조건 확인</strong>
                <span>관측공과 지층, 굴착 구역을 살펴보세요.</span>
              </li>
              <li>
                <strong>설계에서 값을 바꿔 검토</strong>
                <span>해석결과를 입력하고 식과 숫자 대입을 확인하세요.</span>
              </li>
              <li>
                <strong>시공에서 이상 기록</strong>
                <span>시험·계측 곡선과 기준을 비교하고 이슈로 남기세요.</span>
              </li>
              <li>
                <strong>유지관리에서 조치 연결</strong>
                <span>
                  조사 근거, 조치, 재점검을 같은 구역의 이력으로 보관하세요.
                </span>
              </li>
            </ol>
            <p className="notice">
              이 시연은 합성 자료를 사용합니다. 외부 탄소성해석이나 GPR 원신호
              판독을 수행하지 않습니다.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => {
                setHelp(false);
                navigate("tender");
              }}
            >
              시연 시작 <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="modal record-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="record-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-btn"
              aria-label="기록 닫기"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <div className="eyebrow">
              {STAGE_LABELS[selected.stage]} · {selected.zone_id} · 개정{" "}
              {selected.revision}
            </div>
            <h2 id="record-title">{selected.title}</h2>
            <Status status={selected.status} />
            {versions.length > 1 && (
              <label className="field revision-select">
                <span>보관된 개정 이력</span>
                <select
                  value={selected.revision}
                  onChange={(e) => {
                    const version = versions.find(
                      (v) => v.revision === Number(e.target.value),
                    );
                    if (version) setSelected(version);
                  }}
                >
                  {versions.map((v) => (
                    <option key={v.revision} value={v.revision}>
                      개정 {v.revision} · {fmtDate(v.updated_at)} ·{" "}
                      {STATUS_LABELS[v.status]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>{selected.summary}</p>
            <dl className="record-meta">
              <div>
                <dt>자료 구분</dt>
                <dd>
                  {selected.origin === "synthetic"
                    ? "합성 자료"
                    : selected.origin === "calculated"
                      ? "직접 계산"
                      : selected.origin === "official_reference"
                        ? "공식 참고자료"
                        : selected.origin === "imported_analysis"
                          ? "가져온 해석결과"
                          : "실측 자료"}
                </dd>
              </div>
              <div>
                <dt>출처</dt>
                <dd>
                  {selected.source_id} · 개정 {selected.source_revision}
                </dd>
              </div>
              <div>
                <dt>검토 시각</dt>
                <dd>{fmtDate(selected.updated_at)}</dd>
              </div>
              <div>
                <dt>계산 방법</dt>
                <dd>{selected.method_version}</dd>
              </div>
            </dl>
            <ul className="assumptions">
              {selected.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <details>
              <summary>저장된 입력과 결과</summary>
              <pre className="record-json">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </details>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() =>
                  download(`AutoGeo-${selected.id}.json`, {
                    schema_version: 1,
                    site_id: SITE.id,
                    exported_at: new Date().toISOString(),
                    records: [selected],
                  })
                }
              >
                <ArrowDownToLine size={16} /> 기록 내보내기
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  navigate(
                    selected.payload.kind === "standard-adoption"
                      ? "standards"
                      : selected.stage,
                  );
                  setSelected(null);
                }}
              >
                관련 업무 열기 <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
      {resetOpen && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">현장 기록을 초기화할까요?</h2>
            <p>
              이 브라우저에서 추가한 검토·조치와 작성 중인 입력을 지우고 합성
              예제를 다시 불러옵니다. 필요한 기록은 먼저 내보내주세요.
            </p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={exportAll}>
                먼저 내보내기
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setResetOpen(false)}
              >
                취소
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  try {
                    await resetProject(SEED_RECORDS);
                    setResetOpen(false);
                    setEpoch((x) => x + 1);
                    navigate("overview");
                    notify("합성 예제로 초기화했습니다.");
                  } catch (e) {
                    notify(String(e), "error");
                  }
                }}
              >
                초기화
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Status({ status }: { status: ProjectRecord["status"] }) {
  return (
    <span
      className={`badge ${status === "pass" || status === "closed" ? "badge-success" : status === "exceeded" || status === "error" ? "badge-danger" : status === "pending" || status === "stale" ? "badge-warning" : "badge-blue"}`}
    >
      <span className="small-dot" />
      {STATUS_LABELS[status]}
    </span>
  );
}
