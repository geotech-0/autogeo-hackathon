import { useEffect, useRef, useState } from "react";
import { Plus, Minus, Maximize2, MapPin } from "lucide-react";
import "./real-ground.css";
export type BoundsEN = [number, number, number, number];
export type RealSiteAssets = {
  schemaVersion: number;
  siteId: string;
  frame: {
    id: string;
    crs: string;
    originENH: number[];
    boreholeCRSConfirmed: boolean;
    boreholeAxisMapping: string;
  };
  orthophoto: {
    id: string;
    url: string;
    previewUrl: string;
    boundsEN: BoundsEN;
    width: number;
    height: number;
    captureDate: string | null;
    crs: string;
    pixelSizeM: number;
    originalPixels: number[];
    tiles: { url: string; boundsEN: BoundsEN; width: number; height: number }[];
  };
  dsm: {
    url: string;
    captureDate: string | null;
    verticalDatumConfirmed: boolean;
  };
  cad: {
    lineworkUrl?: string;
    entityCount?: number;
    boundaryEN: number[][];
    matrixCADToEN: number[][];
    scale: number;
    rotationDegrees: number;
    heldOutRMSE: number;
    CADControlRMSE: number;
    fitPointCount: number;
    heldOutCount: number;
    meaning: string;
  };
  gcp?: { id: string; easting: number; northing: number; height: number }[];
  gcpCSV: string;
  alignment: { status: string };
  pointcloud?: {
    url: string;
    count: number;
    sourceCount: number;
    originENH: number[];
    stride: number;
    sampling: string;
  };
  geoid?: { applied: boolean; reason: string; files: string[] };
};
export type MapHole = {
  id: string;
  label?: string;
  easting: number;
  northing: number;
  campaign?: string;
};
export type MapAnnotation = {
  id: string;
  easting: number;
  northing: number;
  label?: string;
  color?: string;
};
export const CAMPAIGN_COLORS: Record<string, string> = {
  "2021-02": "#7f56d9",
  "2022-01": "#117bea",
  "2022-08": "#11a37f",
  "2023-11": "#e68616",
};
export function useSiteAssets() {
  const [assets, setAssets] = useState<RealSiteAssets | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/data/ground/site-assets.json")
      .then((r) => {
        if (!r.ok) throw Error("현장 영상 정보를 읽지 못했습니다.");
        return r.json();
      })
      .then((a) => {
        if (alive) setAssets(a);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { assets, error };
}
type Props = {
  assets?: RealSiteAssets;
  holes?: MapHole[];
  selected?: string;
  onSelect?: (id: string) => void;
  annotations?: MapAnnotation[];
  onMapClick?: (p: { easting: number; northing: number }) => void;
  showCAD?: boolean;
  showCADLinework?: boolean;
  showGCP?: boolean;
  sectionNorth?: number;
  transform?: { east: number; north: number; rotation: number; scale: number };
};
export default function RealSiteMap({
  assets: provided,
  holes = [],
  selected,
  onSelect,
  annotations = [],
  onMapClick,
  showCAD = true,
  showCADLinework = false,
  showGCP = false,
  sectionNorth,
  transform,
}: Props) {
  const loaded = useSiteAssets(),
    assets = provided ?? loaded.assets,
    svg = useRef<SVGSVGElement>(null),
    host = useRef<HTMLDivElement>(null),
    drag = useRef<{
      x: number;
      y: number;
      cx: number;
      cy: number;
      moved: boolean;
      holeId?: string;
    } | null>(null);
  const [linework, setLinework] = useState<
    { name: string; count: number; path: string }[]
  >([]);
  const [size, setSize] = useState({ width: 900, height: 520 }),
    [zoom, setZoom] = useState(1),
    [center, setCenter] = useState<[number, number] | null>(null),
    [clicked, setClicked] = useState<{
      easting: number;
      northing: number;
    } | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () =>
      setSize({
        width: Math.max(200, el.clientWidth),
        height: Math.max(200, el.clientHeight),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [assets]);
  useEffect(() => {
    if (!showCADLinework || !assets?.cad.lineworkUrl) return;
    let live = true;
    fetch(assets.cad.lineworkUrl)
      .then((r) => {
        if (!r.ok) throw Error("도면 선형을 불러오지 못했습니다.");
        return r.json();
      })
      .then((a) => {
        if (live) setLinework(a.layers);
      })
      .catch(() => {
        if (live) setLinework([]);
      });
    return () => {
      live = false;
    };
  }, [showCADLinework, assets?.cad.lineworkUrl]);
  if (!assets)
    return (
      <div className="real-map-loading">
        {loaded.error || "실제 정사영상을 불러오는 중…"}
      </div>
    );
  const b = assets.orthophoto.boundsEN,
    fullW = b[2] - b[0],
    fullH = b[3] - b[1],
    c = center ?? [(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2],
    w = fullW / zoom,
    h = fullH / zoom,
    x = c[0] - w / 2,
    y = c[1] - h / 2,
    px = Math.max(w / size.width, h / size.height);
  const locate = (clientX: number, clientY: number) => {
    const mat = svg.current?.getScreenCTM();
    if (!mat) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(mat.inverse());
    return { easting: p.x, northing: -p.y };
  };
  const origin = assets.frame.originENH;
  const imageTransform = transform
    ? `translate(${origin[0] + transform.east} ${-(origin[1] + transform.north)}) rotate(${-transform.rotation}) scale(${transform.scale}) translate(${-origin[0]} ${origin[1]})`
    : undefined;
  const imageAdjusted =
    !!transform &&
    (transform.east !== 0 ||
      transform.north !== 0 ||
      transform.rotation !== 0 ||
      transform.scale !== 1);
  return (
    <div className="real-map" ref={host}>
      <svg
        ref={svg}
        viewBox={`${x} ${y} ${w} ${h}`}
        role="group"
        aria-label="이천자이더리체 실제 정사영상 지도. 확대·이동 가능. 시추공을 선택하면 원문 지층을 확인합니다."
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            cx: c[0],
            cy: c[1],
            moved: false,
            holeId:
              (e.target as Element)
                .closest?.("[data-hole-id]")
                ?.getAttribute("data-hole-id") ?? undefined,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const rect = e.currentTarget.getBoundingClientRect(),
            ratio = Math.min(rect.width / w, rect.height / h);
          const dx = (e.clientX - d.x) / ratio,
            dy = (e.clientY - d.y) / ratio;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
          if (d.moved) setCenter([d.cx - dx, d.cy - dy]);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved) return;
          if (d.holeId) {
            onSelect?.(d.holeId);
            return;
          }
          const p = locate(e.clientX, e.clientY);
          if (p) {
            setClicked(p);
            onMapClick?.(p);
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <rect x={x} y={y} width={w} height={h} fill="#dce5e3" />
        <g transform={imageTransform}>
          <image
            href={assets.orthophoto.url}
            x={b[0]}
            y={-b[3]}
            width={fullW}
            height={fullH}
            preserveAspectRatio="none"
          />
          {zoom > 1.8 &&
            assets.orthophoto.tiles
              .filter(
                (t) =>
                  t.boundsEN[2] >= x &&
                  t.boundsEN[0] <= x + w &&
                  -t.boundsEN[1] >= y &&
                  -t.boundsEN[3] <= y + h,
              )
              .map((t) => (
                <image
                  key={t.url}
                  href={t.url}
                  x={t.boundsEN[0]}
                  y={-t.boundsEN[3]}
                  width={t.boundsEN[2] - t.boundsEN[0]}
                  height={t.boundsEN[3] - t.boundsEN[1]}
                  preserveAspectRatio="none"
                />
              ))}
        </g>
        {showCADLinework && (
          <g
            transform={`translate(${origin[0]} ${-origin[1]})`}
            fill="none"
            stroke="#6bf0ee"
            strokeWidth={0.8}
            vectorEffect="non-scaling-stroke"
            opacity={0.8}
          >
            {linework.map((layer) => (
              <path
                key={layer.name}
                d={layer.path}
                stroke={
                  layer.name === "_앵커"
                    ? "#faba72"
                    : layer.name === "_띠장"
                      ? "#fff47c"
                      : "#6bf0ee"
                }
                strokeWidth={layer.name === "CE-SLOP-FILL" ? 0.45 : 0.9}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        )}
        {showCAD && (
          <polyline
            points={assets.cad.boundaryEN
              .map((p) => `${p[0]},${-p[1]}`)
              .join(" ")}
            fill="none"
            stroke="#fadd5f"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {sectionNorth !== undefined && (
          <line
            x1={b[0]}
            x2={b[2]}
            y1={-sectionNorth}
            y2={-sectionNorth}
            stroke="#e75874"
            strokeWidth={2 * px}
            strokeDasharray={`${7 * px} ${4 * px}`}
          />
        )}
        {showGCP &&
          assets.gcp?.map((p) => (
            <g key={p.id}>
              <path
                d={`M${p.easting - 4 * px} ${-p.northing}h${8 * px} M${p.easting} ${-p.northing - 4 * px}v${8 * px}`}
                stroke="white"
                strokeWidth={2 * px}
              />
              <text
                x={p.easting + 6 * px}
                y={-p.northing - 5 * px}
                fontSize={11 * px}
                fill="white"
                stroke="#263442"
                strokeWidth={2 * px}
                paintOrder="stroke"
              >
                {p.id}
              </text>
            </g>
          ))}
        {holes.map((p) => (
          <g
            key={p.id}
            role="button"
            tabIndex={0}
            data-hole-id={p.id}
            aria-label={`${p.campaign ?? ""} ${p.label ?? p.id} 시추공 선택`}
            aria-pressed={p.id === selected}
            onClick={(e) => {
              // Assistive activation emits a click without a pointer sequence.
              if (e.detail === 0) onSelect?.(p.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(p.id);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={p.easting}
              cy={-p.northing}
              r={(p.id === selected ? 7 : 4.7) * px}
              fill={
                p.id === selected
                  ? "#fff"
                  : (CAMPAIGN_COLORS[p.campaign ?? ""] ?? "#117bea")
              }
              stroke={p.id === selected ? "#112f59" : "white"}
              strokeWidth={2 * px}
            />
            {(zoom > 1.5 || p.id === selected) && (
              <text
                x={p.easting + 8 * px}
                y={-p.northing - 6 * px}
                fontSize={12 * px}
                fontWeight="700"
                fill="white"
                stroke="#173248"
                strokeWidth={3 * px}
                paintOrder="stroke"
              >
                {p.label ?? p.id}
              </text>
            )}
          </g>
        ))}
        {annotations.map((p) => (
          <g key={p.id}>
            <circle
              cx={p.easting}
              cy={-p.northing}
              r={6 * px}
              fill={p.color ?? "#ec583c"}
              stroke="white"
              strokeWidth={2 * px}
            />
            <text
              x={p.easting + 9 * px}
              y={-p.northing + 4 * px}
              fontSize={12 * px}
              fill="white"
              stroke="#173248"
              strokeWidth={3 * px}
              paintOrder="stroke"
            >
              {p.label ?? p.id}
            </text>
          </g>
        ))}
        {clicked && (
          <path
            d={`M${clicked.easting - 6 * px} ${-clicked.northing}h${12 * px} M${clicked.easting} ${-clicked.northing - 6 * px}v${12 * px}`}
            stroke="#ffe770"
            strokeWidth={2 * px}
          />
        )}
      </svg>
      <div className="real-map-toolbar">
        <button
          aria-label="지도 확대"
          onClick={() => setZoom(Math.min(10, zoom * 1.5))}
        >
          <Plus size={17} />
        </button>
        <button
          aria-label="지도 축소"
          onClick={() => setZoom(Math.max(1, zoom / 1.5))}
        >
          <Minus size={17} />
        </button>
        <button
          aria-label="지도 전체 보기"
          onClick={() => {
            setZoom(1);
            setCenter(null);
          }}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div className="real-map-caption">
        <MapPin size={13} />
        <span>
          {clicked
            ? `E ${clicked.easting.toFixed(2)} · N ${clicked.northing.toFixed(2)} m`
            : `EPSG:5186 · 북쪽 ↑ · ${imageAdjusted ? "드론 추가 맞춤 적용" : "원본 영상 좌표"}`}
        </span>
      </div>
      <div className="real-map-scale">{zoom.toFixed(1)}× · 실제 정사영상</div>
    </div>
  );
}
