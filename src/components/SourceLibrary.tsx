import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, FileText, FolderOpen, Search, X } from "lucide-react";
import catalog from "../data/source-catalog.json";
import { HAS_PROVIDED_ORIGINALS } from "../data/source-access";
import ErrorBoundary from "./ErrorBoundary";

const PdfDocument = lazy(() => import("./PdfDocument"));
const sources = catalog.filter((s) => s.category !== "디자인");
type Source = (typeof catalog)[number];
const formatBytes = (bytes: number) =>
  bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;

export default function SourceLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("전체");
  const [selected, setSelected] = useState<Source | null>(null);
  const previewRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (selected) {
      previewRef.current?.focus({ preventScroll: true });
      previewRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }
  }, [selected?.id]);
  const categories = ["전체", ...new Set(sources.map((s) => s.category))];
  const found = useMemo(
    () =>
      sources.filter(
        (s) =>
          (category === "전체" || s.category === category) &&
          `${s.title} ${s.use} ${s.filename}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [query, category],
  );
  const pdfs = sources.filter((s) => s.kind === "pdf" && s.url);
  return (
    <div className="source-library">
      <section className="panel source-intro">
        <div>
          <span className="eyebrow">PROJECT EVIDENCE</span>
          <h2>판단의 출발점, 현장 원자료</h2>
          <p>조사 시기와 원문을 확인하고 지반·설계·시공 검토로 이어가세요.</p>
          {!HAS_PROVIDED_ORIGINALS && (
            <p className="muted small">
              공개판은 전사 수치와 공간 자료를 제공합니다. 원본 문서는 현장
              원자료본에서 열람할 수 있습니다.
            </p>
          )}
        </div>
        <div className="source-count">
          <strong>{pdfs.length}</strong>
          <span>{HAS_PROVIDED_ORIGINALS ? "현장 원문 PDF" : "출처 PDF"}</span>
        </div>
      </section>
      <div className="source-toolbar">
        <label className="search-input">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="자료명, 조사 시기, 용도 검색"
            aria-label="현장 자료 검색"
          />
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="자료 종류"
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="muted">{found.length}개 자료</span>
      </div>
      {selected?.url && (
        <section
          className="panel source-preview"
          id="source-preview"
          aria-label="선택한 원문 미리보기"
        >
          <div className="panel-header">
            <div>
              <span className="code-label">{selected.category}</span>
              <h2 ref={previewRef} tabIndex={-1}>
                {selected.title}
              </h2>
            </div>
            <button
              className="icon-btn"
              aria-label="원문 미리보기 닫기"
              onClick={() => {
                setSelected(null);
                requestAnimationFrame(() => openerRef.current?.focus());
              }}
            >
              <X size={20} />
            </button>
          </div>
          <ErrorBoundary key={selected.id}>
            <Suspense
              fallback={<p role="status">원문 뷰어를 준비하고 있습니다.</p>}
            >
              <PdfDocument url={selected.url} title={selected.title} />
            </Suspense>
          </ErrorBoundary>
        </section>
      )}
      <div className="source-grid">
        {found.map((s) => (
          <article className="panel source-card" key={s.id}>
            <div className="source-card-top">
              <span className="source-file-icon">
                {s.kind === "pdf" ? (
                  <FileText size={22} />
                ) : (
                  <FolderOpen size={22} />
                )}
              </span>
              <span className="badge badge-neutral">{s.category}</span>
            </div>
            <h3>{s.title}</h3>
            <p>{s.use}</p>
            <div className="source-card-meta">
              <span>
                {s.kind.toUpperCase()} · {formatBytes(s.bytes)}
              </span>
              {s.pageCount ? <span>{s.pageCount}쪽</span> : null}
            </div>
            <div className="source-card-actions">
              {s.url ? (
                <button
                  className="btn btn-secondary"
                  aria-expanded={selected?.id === s.id}
                  aria-controls="source-preview"
                  onClick={(event) => {
                    openerRef.current = event.currentTarget;
                    setSelected(s);
                  }}
                >
                  {HAS_PROVIDED_ORIGINALS ? "원문 열기" : "원문 출처"}{" "}
                  <ArrowUpRight size={15} />
                </button>
              ) : (
                <span className="muted small">{s.status}</span>
              )}
              <a className="text-link" href={s.destination}>
                관련 업무 <ArrowUpRight size={14} />
              </a>
            </div>
            {s.sha256 && (
              <details className="source-provenance">
                <summary>출처 확인</summary>
                <p>{s.filename}</p>
                <code>SHA-256 {s.sha256}</code>
              </details>
            )}
          </article>
        ))}
      </div>
      {!found.length && (
        <section className="panel empty-state">
          <Search />
          <h3>검색된 자료가 없습니다</h3>
          <p>검색어 또는 자료 종류를 바꿔주세요.</p>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setQuery("");
              setCategory("전체");
            }}
          >
            검색 조건 초기화
          </button>
        </section>
      )}
    </div>
  );
}
