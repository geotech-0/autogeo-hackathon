import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  HAS_PROVIDED_ORIGINALS,
  isProvidedOriginal,
  PROVIDED_SOURCE_NOTICE,
} from "../data/source-access";

GlobalWorkerOptions.workerSrc = workerUrl;

type PdfProps = { url: string; initialPage?: number; title: string };
export default function PdfDocument(props: PdfProps) {
  if (!HAS_PROVIDED_ORIGINALS && isProvidedOriginal(props.url))
    return (
      <div className="notice">
        <p>{PROVIDED_SOURCE_NOTICE}</p>
        {props.initialPage && (
          <p>
            참조: {props.title} · PDF {props.initialPage}쪽
          </p>
        )}
      </div>
    );
  return <AvailablePdfDocument {...props} />;
}
function AvailablePdfDocument({ url, initialPage = 1, title }: PdfProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState(String(initialPage));
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(700);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      setWidth(Math.max(240, Math.floor(entries[0].contentRect.width - 28)));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDoc(null);
    setPage(initialPage);
    setPageInput(String(initialPage));
    setZoom(1);
    const task = getDocument({
      url,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
    });
    task.promise
      .then((pdf) => {
        if (active) {
          setDoc(pdf);
          const p = Math.min(Math.max(1, initialPage), pdf.numPages);
          setPage(p);
          setPageInput(String(p));
        }
      })
      .catch((e) => {
        if (active) {
          setError(
            `원문을 불러오지 못했습니다. ${e.message || "연결을 확인해주세요."}`,
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [url, initialPage, retry]);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    const target = canvas.current;
    setLoading(true);
    setError("");
    setText("");
    (async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({
        scale: (width / base.width) * zoom,
      });
      const outputScale = Math.min(2, window.devicePixelRatio || 1);
      target.width = Math.floor(viewport.width * outputScale);
      target.height = Math.floor(viewport.height * outputScale);
      target.style.width = `${Math.floor(viewport.width)}px`;
      target.style.height = `${Math.floor(viewport.height)}px`;
      const context = target.getContext("2d");
      if (!context)
        throw new Error("문서 표시를 위한 화면을 만들지 못했습니다.");
      task = pdfPage.render({
        canvas: target,
        canvasContext: context,
        viewport,
        transform:
          outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
      });
      await task.promise;
      if (cancelled) return;
      setLoading(false);
      const words = await pdfPage.getTextContent();
      if (!cancelled)
        setText(words.items.map((i) => ("str" in i ? i.str : "")).join(" "));
    })().catch((e) => {
      if (cancelled || e.name === "RenderingCancelledException") return;
      setError(
        `이 쪽을 표시하지 못했습니다. ${e.message || "다시 시도해주세요."}`,
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width, zoom]);
  const changePage = (p: number) => {
    const next = Math.min(Math.max(1, p), doc?.numPages || 1);
    setPage(next);
    setPageInput(String(next));
    wrap.current?.scrollTo({ top: 0, left: 0 });
  };
  return (
    <div className="pdf-document">
      <div className="pdf-toolbar">
        <div className="pdf-page-controls">
          <button
            className="icon-btn"
            aria-label="원문 이전 쪽"
            onClick={() => changePage(page - 1)}
            disabled={!doc || page <= 1}
          >
            <ChevronLeft size={18} />
          </button>
          <label>
            <input
              aria-label="원문 PDF 쪽"
              type="number"
              min="1"
              max={doc?.numPages || 1}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => changePage(Number(pageInput) || 1)}
              onKeyDown={(e) => {
                if (e.key === "Enter") changePage(Number(pageInput) || 1);
              }}
            />{" "}
            / {doc?.numPages || "—"}쪽
          </label>
          <button
            className="icon-btn"
            aria-label="원문 다음 쪽"
            onClick={() => changePage(page + 1)}
            disabled={!doc || page >= doc.numPages}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="pdf-zoom-controls">
          <button
            className="icon-btn"
            aria-label="원문 축소"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            disabled={!doc || zoom <= 0.5}
          >
            <ZoomOut size={18} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="icon-btn"
            aria-label="원문 확대"
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
            disabled={!doc || zoom >= 3}
          >
            <ZoomIn size={18} />
          </button>
          <button className="text-link" onClick={() => setZoom(1)}>
            너비 맞춤
          </button>
        </div>
        <a className="text-link" href={url} download>
          <Download size={16} />
          원문 다운로드
        </a>
      </div>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
          <button
            className="btn btn-secondary"
            onClick={() => setRetry((x) => x + 1)}
          >
            <RotateCcw size={16} />
            다시 불러오기
          </button>
        </div>
      )}
      <div className="pdf-canvas-wrap" ref={wrap} aria-busy={loading}>
        {loading && (
          <div className="pdf-loading" role="status">
            원문 {page}쪽을 표시하고 있습니다.
          </div>
        )}
        <canvas
          key={`${url}-${page}-${width}-${zoom}`}
          ref={canvas}
          role="img"
          aria-label={`${title} PDF ${page}쪽`}
        />
      </div>
      {text && (
        <details className="pdf-text">
          <summary>이 쪽의 텍스트 확인</summary>
          <p>{text}</p>
        </details>
      )}
      <p className="muted small">
        PDF 쪽 번호입니다. 문서에 인쇄된 쪽 번호와 다를 수 있습니다.
      </p>
    </div>
  );
}
