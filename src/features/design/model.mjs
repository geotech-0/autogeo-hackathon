import { calculate as anchorCore } from "./kernels/anchor.mjs";
import { calculate as waleCore } from "./kernels/wale.mjs";
import { calculate as pileCore } from "./kernels/pile.mjs";
import { calculate as timberCore } from "./kernels/timber.mjs";

export const VERSION = "autogeo-members-2.0";
export const MEMBER_IDS = ["anchor", "wale", "pile", "timber"];
const field = (key, label, unit, value, group = "geometry", extra = {}) => ({
  key,
  label,
  unit,
  value,
  group,
  ...extra,
});
const quantity = (
  key,
  label,
  unit,
  value,
  units,
  stage,
  location,
  extra = {},
) =>
  field(key, label, unit, value, "analysis", {
    units,
    stage,
    location,
    ...extra,
  });

// Public fixtures are authored synthetic cases. Material properties are shared engineering data.
export const MODULES = {
  anchor: {
    id: "anchor",
    title: "어스앵커",
    subtitle: "인장력 · 자유장 · 정착장",
    asset: "EA-01",
    material: "SWPC7B · Ø12.7 mm 강연선",
    scope: "일시 앵커 · 자유장+정착장+0.5 m · 설계축력 기준",
    fields: [
      field("strandCount", "강연선 본수", "본", 4, "geometry", {
        min: 1,
        max: 12,
        step: 1,
        affectsAnalysis: true,
      }),
      field("adoptedFreeLengthM", "자유장 Lf", "m", 6, "geometry", {
        min: 0.1,
        step: 0.1,
        affectsAnalysis: true,
      }),
      field("adoptedAnchorageLengthM", "정착장 La", "m", 5, "geometry", {
        min: 0.1,
        step: 0.1,
        affectsAnalysis: true,
      }),
      field("spacingM", "앵커 수평간격", "m", 1.5, "geometry", {
        min: 0.1,
        step: 0.1,
        affectsAnalysis: true,
      }),
      field("freeSafetyDistanceM", "자유장 안전거리", "m", 1.5, "advanced", {
        min: 0,
        step: 0.1,
      }),
      field(
        "groundFrictionKpa",
        "지반 주면마찰저항 τu",
        "kPa",
        350,
        "advanced",
        { min: 1, step: 10 },
      ),
      field("bondStressKpa", "허용부착응력 τa", "kPa", 700, "advanced", {
        min: 1,
        step: 10,
      }),
      field("pulloutSafetyFactor", "앵커 내력 안전율", "배", 1.5, "advanced", {
        min: 1,
        step: 0.1,
      }),
      field("slipMm", "PC강선 활동량", "mm", 3, "advanced", {
        min: 0,
        step: 0.1,
      }),
      quantity(
        "reactionKnPerM",
        "최대 축방향 반력 R′",
        "kN/m",
        40,
        ["kN/m", "kN/개"],
        "CS-04 · 2차 굴착",
        "EA-01 · GL -2.0 m",
        { direction: "앵커 축방향 · 인장 양(+)" },
      ),
    ],
    fixed: {
      strandAreaMm2: 98.71,
      strandDiameterMm: 12.7,
      yieldStrengthMpa: 1570,
      ultimateStrengthMpa: 1860,
      yieldAllowFactor: 0.8,
      ultimateAllowFactor: 0.65,
      elasticModulusMpa: 200000,
      relaxationPercent: 5,
      relaxationStressFactor: 0.8,
      stressExtraLengthM: 0.5,
      geometricFreeLengthM: 3.6,
      totalExtraLengthM: 1.5,
      boreDiameterMm: 100,
      minimumAnchorageLengthM: 3,
      maximumAnchorageLengthM: 10,
    },
    fixedRows: [
      ["재료·강연선", "SWPC7B / Ø12.7 mm / 1본 면적98.71 mm²"],
      ["강도·탄성계수", "fpy1,570 / fpu1,860 / Ep200,000 MPa"],
      ["허용인장력", "min(0.65 fpu, 0.80 fpy)"],
      ["긴장손실 길이", "자유장 + 정착장 + 0.5 m"],
      ["자유장 기하 채택값", "3.6 m · 합성 모델의 별도 기하조건"],
      ["정착장 범위", "3~10 m / 천공경100 mm"],
    ],
    limitations: [
      "설치각을 반영한 축방향 반력입니다. 수평반력을 입력하거나 각도를 다시 보정하지 않습니다.",
      "파괴면까지의 기하 길이는 고정 채택값입니다. 새 파괴면 해석은 수행하지 않습니다.",
    ],
  },
  wale: {
    id: "wale",
    title: "띠장",
    subtitle: "앵커 전달하중 · 휨 · 전단",
    asset: "WA-01",
    material: "2H 구성 · H298×201×9/14 · SS275",
    scope: "상단 분담 모델 · 연속보 · 등분포하중",
    fields: [
      field("spanMm", "계산지간 L", "mm", 1500, "geometry", {
        min: 100,
        step: 50,
        affectsAnalysis: true,
      }),
      field("leverAMm", "브래킷 전체 거리 a", "mm", 600, "geometry", {
        min: 1,
        step: 10,
      }),
      field("leverCMm", "작용점~하단 거리 c", "mm", 400, "geometry", {
        min: 1,
        step: 10,
      }),
      field("temporaryFactor", "가설 허용응력 보정", "배", 1.5, "advanced", {
        min: 1,
        max: 1.5,
        step: 0.05,
      }),
      field("reuseFactor", "재사용·부식 계수", "배", 0.9, "advanced", {
        min: 0.01,
        max: 1,
        step: 0.05,
      }),
    ],
    fixed: {
      angleDeg: 30,
      flangeWidthMm: 201,
      sectionModulusMm3: 893000,
      shearAreaMm2: 2430,
      reactionCoefficient: 1.1,
      momentCoefficient: 0.1,
      shearCoefficient: 0.6,
    },
    fixedRows: [
      ["재료·단면", "SS275 / H298×201×9/14"],
      ["휨 단면계수 Zx", "893,000 mm³"],
      ["전단 유효면적 Aw", "2,430 mm²"],
      ["앵커 설치각", "수평면에서30° · 합성 모델 고정"],
      ["보 모델", "연속보 kR1.1 / kM0.1 / kV0.6"],
      ["단면 구성", "2H 상단 분담 c/a · a/2≤c<a"],
    ],
    limitations: [
      "집중하중·단순보·다른 단면개수는 이번 계산방법에서 지원하지 않습니다.",
      "이음·브래킷·접합부 및 하단 띠장 강도는 별도 검토 대상입니다.",
    ],
  },
  pile: {
    id: "pile",
    title: "H-Pile",
    subtitle: "응력 · 수평변위 · 지지력",
    asset: "HP-01",
    material: "H300×300×10×15 · SHP275(W)",
    scope: "강축 부재 검토 · 채택 변위 비교 · Qu 직접 입력",
    fields: [
      field("spacingM", "말뚝 수평간격", "m", 1.5, "geometry", {
        min: 0.1,
        step: 0.1,
        affectsAnalysis: true,
      }),
      field("unbracedLengthMm", "말뚝 비지지길이", "mm", 4000, "geometry", {
        min: 1,
        step: 100,
        affectsAnalysis: true,
      }),
      field("ultimateBearingKn", "극한지지력 Qu", "kN", 1800, "geometry", {
        min: 0,
        step: 10,
      }),
      field("bearingSafetyFactor", "지지력 안전율 Fs", "배", 2, "geometry", {
        min: 1,
        step: 0.1,
      }),
      field("allowableFactor", "가설 허용응력 보정", "배", 1.5, "advanced", {
        min: 1,
        max: 1.5,
        step: 0.05,
      }),
      field("reuseFactor", "재사용·부식 계수", "배", 0.9, "advanced", {
        min: 0.01,
        max: 1,
        step: 0.05,
      }),
      field(
        "displacementLimitPercent",
        "굴착깊이 대비 허용변위율",
        "%",
        0.3,
        "advanced",
        { min: 0.001, step: 0.01 },
      ),
      quantity(
        "axialForceKn",
        "압축축력 N",
        "kN/본",
        60,
        ["kN/본"],
        "채택 하중",
        "HP-01 · 지장물 자중",
        { direction: "말뚝 축방향 · 압축 양(+)" },
      ),
      quantity(
        "momentPerMKnm",
        "최대모멘트 M′",
        "kN·m/m",
        75,
        ["kN·m/m", "kN·m/본"],
        "CS-08 · 슬래브 타설",
        "HP-01 · GL -7.0 m",
        { absolute: true, direction: "강축 휨 · 원시부호 보존 후 절대최대" },
      ),
      quantity(
        "shearPerMKn",
        "최대전단력 V′",
        "kN/m",
        90,
        ["kN/m", "kN/본"],
        "CS-08 · 슬래브 타설",
        "HP-01 · GL -7.0 m",
        {
          absolute: true,
          direction: "벽체 수평방향 · 원시부호 보존 후 절대최대",
        },
      ),
      quantity(
        "displacementMm",
        "최대 수평변위 δ",
        "mm",
        12,
        ["mm", "m"],
        "CS-06 · 기초 타설",
        "HP-01 · GL -5.0 m",
        { absolute: true, direction: "수평변위 · 원시부호 보존 후 절대최대" },
      ),
    ],
    fixed: {
      areaMm2: 11980,
      sectionModulusMm3: 1360000,
      webAreaMm2: 2700,
      radiusMm: 131,
      flangeWidthMm: 300,
      excavationDepthM: 10,
    },
    fixedRows: [
      ["강재·단면", "SHP275(W) / H300×300×10×15"],
      ["단면성능", "A11,980 mm² / Zx1,360,000 mm³"],
      ["전단·회전반경", "Aw2,700 mm² / Rx131 mm"],
      ["지지조건", "Lc=Lb=입력 비지지길이 · 강축"],
      ["최종 굴착깊이 H", "10.0 m · 합성A 현장"],
      ["지지력 방법", "직접 채택한 Qu / Fs · 경험식 미혼합"],
    ],
    limitations: [
      "M′·V′·변위의 지배단계가 다를 수 있습니다. 성분별 최대값에 대한 포락 검토입니다.",
      "약축·국부좌굴·접합부와 굴착 전체 안정은 포함하지 않습니다.",
    ],
  },
  timber: {
    id: "timber",
    title: "토류판",
    subtitle: "휨 · 전단 · 필요두께",
    asset: "TB-01",
    material: "목재 토류판 · 직사각형 단면",
    scope: "GL 0~-10 m · 단순지지 · 등분포 면압",
    fields: [
      field("heightMm", "토류판 높이 H", "mm", 150, "geometry", {
        min: 10,
        step: 10,
        affectsAnalysis: true,
      }),
      field("thicknessMm", "토류판 두께 t", "mm", 100, "geometry", {
        min: 5,
        step: 5,
        affectsAnalysis: true,
      }),
      field("spacingMm", "H-Pile 수평간격", "mm", 1500, "geometry", {
        min: 100,
        step: 50,
        affectsAnalysis: true,
      }),
      field("pileWidthMm", "H-Pile 폭 b", "mm", 300, "geometry", {
        min: 10,
        step: 10,
        affectsAnalysis: true,
      }),
      field("allowableMpa", "목재 허용휨응력", "MPa", 13.5, "advanced", {
        min: 0.1,
        step: 0.1,
      }),
      field("allowableShearMpa", "목재 허용전단응력", "MPa", 1.05, "advanced", {
        min: 0.01,
        step: 0.05,
      }),
      quantity(
        "pressureKpa",
        "검토구간 최대 면압 p",
        "kPa",
        55,
        ["kPa", "MPa", "kN/m"],
        "CS-05 · 최종 굴착",
        "TB-01 · GL 0~-10 m",
        { direction: "토류판에 작용하는 면압 · 양(+)" },
      ),
    ],
    fixed: {},
    fixedRows: [
      ["설계지간", "L=s−3b/4 · 자동계산"],
      ["지지·하중", "양단 단순지지 · 균일 직사각형 · 등분포"],
      ["토압 입력", "면압kPa → 판높이를 곱해 선하중kN/m"],
      ["토압 감소/되메움 옵션", "미적용 · 별도 모드 지원 안 함"],
      ["전단 표시", "채택 평균전단 + 직사각형 최대전단 구분"],
    ],
    limitations: [
      "입력값은 면압입니다. 선하중kN/m 입력 시 현재 판높이로 나누어 면압으로 환산합니다.",
      "필요두께는 휨·전단 검토값이며 처짐·연결부까지 고려한 최종 채택두께는 아닙니다.",
    ],
  },
};
const cores = {
  anchor: anchorCore,
  wale: waleCore,
  pile: pileCore,
  timber: timberCore,
};
export function digest(value) {
  let h = 2166136261;
  for (const c of JSON.stringify(value)) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return (h >>> 0).toString(16);
}
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
export function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !numeric.test(value.trim())) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || (n === 0 && /[1-9]/.test(value.split(/[eE]/)[0])))
    return null;
  return n;
}
export function geometrySignature(id, member, modelRevision) {
  return digest({
    id,
    modelRevision,
    geometry: MODULES[id].fields
      .filter((f) => f.affectsAnalysis)
      .map((f) => [f.key, member.values[f.key]]),
  });
}
export function createWorkspace() {
  const state = {
    schemaVersion: 2,
    label: "기본 검토안",
    source: {
      origin: "synthetic",
      id: "SYN-A-DESIGN-01",
      revision: "1",
      label: "합성 탄소성해석 예제",
      program: "외부 해석결과 채택",
      modelId: "A-01-ELASTO",
      modelRevision: "1",
      programVersion: "시연 예제 v1",
      runDate: "2026-09-21",
      combination: "성분별 독립 최대 포락",
      enteredBy: "시연 사용자",
      evidence: "SYN-A-DESIGN-01 / 합성 입력표",
      quEvidence: "합성 지지력 검토 채택값 / 직접 입력",
    },
    members: {},
  };
  for (const id of MEMBER_IDS) {
    const m = MODULES[id];
    const member = {
      values: Object.fromEntries(m.fields.map((f) => [f.key, String(f.value)])),
      quantities: Object.fromEntries(
        m.fields
          .filter((f) => f.group === "analysis")
          .map((f) => [
            f.key,
            {
              unit: f.unit,
              stage: f.stage,
              location: f.location,
              direction: f.direction,
              aggregation: f.absolute ? "max_absolute" : "adopted_max",
              evidence: "합성 입력표 / " + f.key,
            },
          ]),
      ),
      revision: 1,
      confirmedGeometry: "",
    };
    member.confirmedGeometry = geometrySignature(
      id,
      member,
      state.source.modelId + "::" + state.source.modelRevision,
    );
    state.members[id] = member;
  }
  return state;
}
export function updateValue(state, id, key, value) {
  const f = MODULES[id]?.fields.find((f) => f.key === key);
  if (!f) throw new Error("편집 허용목록에 없는 항목입니다.");
  const next = structuredClone(state);
  next.members[id].values[key] = String(value);
  next.members[id].revision++;
  return next;
}
export function updateQuantity(state, id, key, patch) {
  const f = MODULES[id]?.fields.find(
    (f) => f.key === key && f.group === "analysis",
  );
  if (!f) throw new Error("해석결과 항목이 아닙니다.");
  const next = structuredClone(state);
  for (const [name, value] of Object.entries(patch)) {
    if (!["unit", "stage", "location", "evidence"].includes(name))
      throw new Error("변경할 수 없는 해석 메타데이터입니다.");
    if (name === "unit" && !f.units.includes(value))
      throw new Error("지원하지 않는 단위입니다.");
    next.members[id].quantities[key][name] = String(value).slice(0, 1000);
  }
  next.members[id].revision++;
  return next;
}
export function confirmGeometry(state, id) {
  const next = structuredClone(state);
  next.members[id].confirmedGeometry = geometrySignature(
    id,
    next.members[id],
    next.source.modelId + "::" + next.source.modelRevision,
  );
  return next;
}
export function normalizeQuantity(f, value, meta, input) {
  let n = finiteNumber(value);
  if (n === null) throw new Error("빈칸이 아닌 유한한 숫자를 입력하세요.");
  if (!f.units.includes(meta?.unit))
    throw new Error("지원하는 단위를 선택하세요.");
  if (f.absolute) n = Math.abs(n);
  else if (n < 0) throw new Error("이 항목은 양(+)의 채택값을 입력하세요.");
  let conversion = "원시값과 계산 단위가 같습니다.";
  const u = meta.unit;
  if (f.key === "reactionKnPerM" && u === "kN/개") {
    n /= input.spacingM;
    conversion = "1개소 축력 ÷ 앵커 수평간격 → 단위폭 반력";
  }
  if (f.key === "momentPerMKnm" && u === "kN·m/본") {
    n /= input.spacingM;
    conversion = "1본 모멘트 ÷ 말뚝 간격 → 단위폭 모멘트";
  }
  if (f.key === "shearPerMKn" && u === "kN/본") {
    n /= input.spacingM;
    conversion = "1본 전단력 ÷ 말뚝 간격 → 단위폭 전단력";
  }
  if (f.key === "displacementMm" && u === "m") {
    n *= 1000;
    conversion = "m × 1000 → mm";
  }
  if (f.key === "pressureKpa" && u === "MPa") {
    n *= 1000;
    conversion = "MPa × 1000 → kPa";
  }
  if (f.key === "pressureKpa" && u === "kN/m") {
    n /= input.heightMm / 1000;
    conversion = "선하중 ÷ 판높이(m) → 면압(kPa)";
  }
  if (!Number.isFinite(n))
    throw new Error("단위변환에 필요한 제원을 확인하세요.");
  return {
    value: n,
    rawValue: finiteNumber(value),
    rawUnit: u,
    unit: f.unit,
    basis:
      f.unit === "kN/m" || f.unit === "kN·m/m"
        ? "단위벽체 폭1 m"
        : f.key === "pressureKpa"
          ? "면압"
          : f.key === "axialForceKn"
            ? "말뚝1본"
            : "해당 부재",
    conversion,
    stage: meta.stage,
    location: meta.location,
    direction: f.direction,
    aggregation: f.absolute ? "max_absolute" : "adopted_max",
    evidence: meta.evidence || "",
  };
}
export function computeMember(state, id, anchorResult) {
  const module = MODULES[id];
  const member = state.members?.[id];
  if (!member)
    return {
      ok: false,
      errors: { _form: "부재 입력이 없습니다." },
      status: "error",
    };
  const input = { ...module.fixed };
  const errors = {};
  const quantities = {};
  for (const f of module.fields.filter((f) => f.group !== "analysis")) {
    const n = finiteNumber(member.values[f.key]);
    if (n === null) errors[f.key] = "숫자를 입력하세요.";
    else if (
      (f.min !== undefined && n < f.min) ||
      (f.max !== undefined && n > f.max)
    )
      errors[f.key] =
        `${f.min ?? "하한 없음"}~${f.max ?? "상한 없음"} ${f.unit} 소프트웨어 지원범위를 확인하세요.`;
    else input[f.key] = n;
  }
  for (const f of module.fields.filter((f) => f.group === "analysis")) {
    try {
      const q = normalizeQuantity(
        f,
        member.values[f.key],
        member.quantities[f.key],
        input,
      );
      quantities[f.key] = q;
      input[f.key] = q.value;
      if (!q.stage?.trim() || !q.location?.trim())
        errors[f.key] = "지배단계와 위치를 함께 입력하세요.";
    } catch (e) {
      errors[f.key] = e.message;
    }
  }
  if (id === "pile") input.effectiveLengthMm = input.unbracedLengthMm;
  const dependencies = [];
  if (id === "wale") {
    const parent = anchorResult || computeMember(state, "anchor");
    if (!parent.ok)
      errors.anchorForceKn =
        "앵커 입력을 먼저 완료하세요. 초기긴장력 Jf를 연결할 수 없습니다.";
    else {
      input.anchorForceKn = parent.results.jackingForceKn;
      dependencies.push({
        member: "anchor",
        revision: state.members.anchor.revision,
        fingerprint: parent.fingerprint,
        value: input.anchorForceKn,
        unit: "kN/개",
      });
    }
  }
  if (
    [
      "id",
      "revision",
      "label",
      "program",
      "modelId",
      "modelRevision",
      "evidence",
    ].some((k) => !state.source?.[k]?.trim())
  )
    errors._source =
      "자료 ID·개정·명칭·해석 프로그램·모델과 근거를 입력하세요.";
  if (id === "pile" && !state.source?.quEvidence?.trim())
    errors.ultimateBearingKn = "채택 Qu의 근거를 입력하세요.";
  if (Object.keys(errors).length) return { ok: false, errors, status: "error" };
  const computed = cores[id](input);
  if (!computed.ok) return { ...computed, status: "error" };
  const stale =
    member.confirmedGeometry !==
      geometrySignature(
        id,
        member,
        state.source.modelId + "::" + state.source.modelRevision,
      ) ||
    (id === "wale" &&
      (anchorResult || computeMember(state, "anchor")).status === "stale");
  const checks = computed.checks.map((c) => ({
    ...c,
    utilization:
      c.relation === ">="
        ? c.value === 0
          ? null
          : c.limit / c.value
        : c.limit === 0
          ? c.value === 0
            ? 0
            : null
          : c.value / c.limit,
  }));
  const exceeded = checks.some((c) => !c.pass);
  const status = stale ? "stale" : exceeded ? "exceeded" : "pass";
  const warnings = [
    ...module.limitations,
    "채택한 허용값·방법에 대한 부재 검토이며 외부 해석 재실행 및 흙막이 전체 안정성 판정은 포함하지 않습니다.",
  ];
  if (stale)
    warnings.unshift(
      "제원 또는 해석모델 개정이 바뀌었습니다. 입력한 해석결과가 변경 모델과 대응하는지 확인하세요.",
    );
  if (id === "pile" && input.displacementLimitPercent !== 0.3)
    warnings.push(
      "허용변위율을 기본값에서 변경했습니다. 변경한 관리기준의 근거를 기록하세요.",
    );
  return {
    ...computed,
    checks,
    warnings,
    status,
    quantities,
    dependencies,
    fingerprint: digest({
      id,
      version: VERSION,
      input,
      quantities,
      source: state.source,
      dependencies,
    }),
    maxUtilization: checks.some((c) => c.utilization === null)
      ? null
      : Math.max(0, ...checks.map((c) => c.utilization)),
    member: id,
  };
}
export function computeWorkspace(state) {
  const a = computeMember(state, "anchor");
  return {
    anchor: a,
    wale: computeMember(state, "wale", a),
    pile: computeMember(state, "pile"),
    timber: computeMember(state, "timber"),
  };
}
export function restoreWorkspace(raw) {
  if (!raw || raw.schemaVersion !== 2)
    throw new Error("지원하지 않는 설계 기록 형식입니다.");
  const fresh = createWorkspace();
  if (typeof raw.label === "string") fresh.label = raw.label.slice(0, 120);
  for (const k of Object.keys(fresh.source)) {
    if (typeof raw.source?.[k] !== "string")
      throw new Error("기록에 출처 메타데이터가 누락되었습니다.");
    fresh.source[k] = raw.source[k].slice(0, 1000);
  }
  if (!["synthetic", "imported_analysis"].includes(fresh.source.origin))
    throw new Error("자료 구분이 유효하지 않습니다.");
  for (const id of MEMBER_IDS) {
    const target = fresh.members[id],
      saved = raw.members?.[id];
    if (!saved) throw new Error("필수 부재 입력이 누락되었습니다.");
    for (const key of Object.keys(saved.values || {})) {
      if (!MODULES[id].fields.some((f) => f.key === key))
        throw new Error("기록에 편집 불가 항목이 포함되어 있습니다.");
    }
    for (const f of MODULES[id].fields) {
      if (!Object.hasOwn(saved.values || {}, f.key))
        throw new Error("기록에 필수 입력이 누락되었습니다.");
      target.values[f.key] = String(saved.values[f.key]);
      if (f.group === "analysis") {
        const q = saved.quantities?.[f.key];
        if (!q || !f.units.includes(q.unit))
          throw new Error("기록의 단위를 확인하세요.");
        target.quantities[f.key] = {
          ...target.quantities[f.key],
          unit: q.unit,
          stage: String(q.stage || ""),
          location: String(q.location || ""),
          evidence: String(q.evidence || ""),
        };
      }
    }
    target.revision =
      Number.isInteger(saved.revision) && saved.revision > 0
        ? saved.revision
        : 1;
    target.confirmedGeometry =
      typeof saved.confirmedGeometry === "string"
        ? saved.confirmedGeometry
        : "";
  }
  return fresh;
}
export function makeDesignDraft(state) {
  const safe = restoreWorkspace(state);
  const calculations = computeWorkspace(safe);
  const invalid = MEMBER_IDS.filter((id) => !calculations[id].ok);
  if (invalid.length)
    throw new Error(
      `${invalid.map((id) => MODULES[id].title).join(", ")} 입력을 확인하세요.`,
    );
  const status = MEMBER_IDS.some((id) => calculations[id].status === "stale")
    ? "stale"
    : MEMBER_IDS.some((id) => calculations[id].status === "exceeded")
      ? "exceeded"
      : "pass";
  const counts = MEMBER_IDS.reduce(
    (sum, id) => sum + calculations[id].checks.length,
    0,
  );
  return {
    stage: "design",
    title: safe.label || "흙막이 부재 검토",
    status,
    origin: safe.source.origin,
    source_id: safe.source.id,
    source_revision: safe.source.revision,
    method_version: VERSION,
    asset_id: "A-01-RETAINING",
    summary: `4개 부재 · ${counts}개 항목 · ${status === "pass" ? "채택 기준 만족" : status === "stale" ? "해석결과 재확인 필요" : "기준 초과 항목 있음"}`,
    assumptions: [
      `${safe.source.origin === "synthetic" ? "합성 A현장" : "사용자 채택 해석자료"} 기준. 수동 입력한 해석결과에 대한 부재 검토.`,
      "성분별 최대값의 지배 시공단계가 다를 수 있음.",
    ],
    payload: {
      kind: "design-review",
      schema_version: 2,
      workspace: safe,
      calculations,
      input_policy: Object.fromEntries(
        MEMBER_IDS.map((id) => [
          id,
          {
            editable: MODULES[id].fields
              .filter((f) => f.group !== "analysis")
              .map((f) => f.key),
            manual_analysis: MODULES[id].fields
              .filter((f) => f.group === "analysis")
              .map((f) => f.key),
            fixed: MODULES[id].fixed,
            derived: Object.keys(calculations[id].results),
            method: MODULES[id].scope,
          },
        ]),
      ),
    },
  };
}
export function exportDesign(state) {
  return JSON.stringify(
    {
      format: "autogeo-design",
      schema_version: 2,
      method_version: VERSION,
      workspace: restoreWorkspace(state),
    },
    null,
    2,
  );
}
export function importDesign(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON 파일을 읽을 수 없습니다.");
  }
  if (
    raw.format !== "autogeo-design" ||
    raw.schema_version !== 2 ||
    raw.method_version !== VERSION
  )
    throw new Error("지원하지 않는 설계 내보내기 형식입니다.");
  return restoreWorkspace(raw.workspace);
}
export function comparisonRows(a, b) {
  const ca = computeWorkspace(a),
    cb = computeWorkspace(b);
  return MEMBER_IDS.map((id) => ({
    id,
    title: MODULES[id].title,
    before: ca[id].ok ? ca[id].maxUtilization : null,
    after: cb[id].ok ? cb[id].maxUtilization : null,
    beforeStatus: ca[id].status,
    afterStatus: cb[id].status,
    changed: MODULES[id].fields
      .filter(
        (f) => a.members[id].values[f.key] !== b.members[id].values[f.key],
      )
      .map((f) => f.label),
  }));
}
