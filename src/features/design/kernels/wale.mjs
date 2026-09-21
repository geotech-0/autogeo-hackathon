// Pure calculation core adapted from the existing member engines.
// Project presets, document identifiers, and report serializers are intentionally excluded.
const BASE = {
  reactionCoefficient: 1.1,
  momentCoefficient: 0.1,
  shearCoefficient: 0.6,
};
// These input bounds are software operating limits, not structural design limits.
const fields = [
  {
    key: "anchorForceKn",
    label: "앵커 채택 축력 Jf",
    unit: "kN",
    min: 0,
    max: 100000,
    step: 0.001,
    group: "앵커 전달하중",
    hint: "손실을 포함한 앵커 초기긴장력 Jf를 채택합니다.",
  },
  {
    key: "angleDeg",
    label: "앵커 수평면 경사 θ",
    unit: "°",
    min: 0,
    max: 89.9,
    step: 0.1,
    group: "앵커 전달하중",
  },
  {
    key: "leverAMm",
    label: "채택 브래킷 지점간 거리 a",
    unit: "mm",
    min: 1,
    max: 10000,
    step: 1,
    group: "앵커 전달하중",
  },
  {
    key: "leverCMm",
    label: "작용점에서 하단 지점까지 c",
    unit: "mm",
    min: 0.1,
    max: 10000,
    step: 0.1,
    group: "앵커 전달하중",
    hint: "채택 상단 지배 반력 c/a. a/2 ≤ c < a 범위만 계산합니다.",
  },
  {
    key: "spanMm",
    label: "띠장 계산지간 L",
    unit: "mm",
    min: 100,
    max: 30000,
    step: 1,
    group: "띠장 단면·지간",
    hint: "채택은 이 L을 휨허용식의 고정점간 거리에도 채택합니다.",
  },
  {
    key: "flangeWidthMm",
    label: "압축 플랜지 폭 B",
    unit: "mm",
    min: 10,
    max: 2000,
    step: 1,
    group: "띠장 단면·지간",
  },
  {
    key: "sectionModulusMm3",
    label: "휨 단면계수 Zx",
    unit: "mm³",
    min: 1000,
    max: 1e9,
    step: 1000,
    group: "띠장 단면·지간",
    hint: "단면표 직접 입력. 폭을 바꿔도 Zx가 자동 산정되지 않습니다.",
  },
  {
    key: "shearAreaMm2",
    label: "전단 유효면적 Aw",
    unit: "mm²",
    min: 1,
    max: 1e6,
    step: 1,
    group: "띠장 단면·지간",
    hint: "채택은 웨브 면적 2430 mm²를 채택합니다.",
  },
  {
    key: "reactionCoefficient",
    label: "채택 반력계수 kR",
    unit: "–",
    min: 0.01,
    max: 5,
    step: 0.01,
    group: "채택 연속보 계수",
    hint: "Rmax = kR·wL. 채택 11/10; 경계조건 자동해석값이 아닙니다.",
  },
  {
    key: "momentCoefficient",
    label: "채택 모멘트계수 kM",
    unit: "–",
    min: 0.0001,
    max: 2,
    step: 0.01,
    group: "채택 연속보 계수",
    hint: "Mmax = kM·wL². 채택 1/10.",
  },
  {
    key: "shearCoefficient",
    label: "채택 전단계수 kV",
    unit: "–",
    min: 0.0001,
    max: 5,
    step: 0.01,
    group: "채택 연속보 계수",
    hint: "Vmax = kV·wL. 채택 6/10.",
  },
  {
    key: "temporaryFactor",
    label: "허용응력 가설 보정계수",
    unit: "–",
    min: 0.1,
    max: 2,
    step: 0.05,
    group: "채택 허용응력 보정",
    hint: "채택 1.5. 방법표의 수치는 이 계수를 이미 포함합니다.",
  },
  {
    key: "reuseFactor",
    label: "재사용·부식 저감계수",
    unit: "–",
    min: 0.01,
    max: 1,
    step: 0.01,
    group: "채택 허용응력 보정",
    hint: "채택 0.9. 실제 부재 상태로 자동 산정하지 않습니다.",
  },
];

const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
function strictNumber(raw) {
  if (typeof raw === "number")
    return Number.isFinite(raw) ? (raw === 0 ? 0 : raw) : null;
  if (typeof raw !== "string" || !DECIMAL.test(raw.trim())) return null;
  const text = raw.trim(),
    number = Number(text);
  if (
    !Number.isFinite(number) ||
    (number === 0 && /[1-9]/u.test(text.split(/[eE]/u)[0]))
  )
    return null;
  return number === 0 ? 0 : number;
}

export function calculate(raw) {
  const input = {},
    errors = {};
  for (const field of fields) {
    const value = strictNumber(
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? raw[field.key]
        : undefined,
    );
    if (value === null)
      errors[field.key] = `${field.label}: 유한한 숫자를 입력하세요.`;
    else if (value < field.min || value > field.max)
      errors[field.key] =
        `${field.label}: ${field.min}~${field.max} ${field.unit} 범위로 입력하세요. (소프트웨어 운영 범위)`;
    else input[field.key] = value;
  }
  if (!errors.leverAMm && !errors.leverCMm && input.leverCMm >= input.leverAMm)
    errors.leverCMm =
      "브래킷 거리 c는 0보다 크고 a보다 작아야 합니다. a=b+c 조건을 확인하세요.";
  if (
    !errors.leverAMm &&
    !errors.leverCMm &&
    input.leverCMm < input.leverAMm / 2
  )
    errors.leverCMm =
      "c < a/2이면 하단 분담 반력이 지배하여 현재 상단 채택 모델 범위 밖입니다. 하단 띠장 모델·단면·연결부를 별도 검토해야 합니다.";
  if (
    !errors.spanMm &&
    !errors.flangeWidthMm &&
    input.spanMm / input.flangeWidthMm > 30
  )
    errors.spanMm =
      "L/B > 30의 채택 허용휨응력식은 확인되지 않았습니다. 이 범위는 외삽 계산하지 않습니다.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const i = input,
    L = i.spanMm / 1000;
  const leverBMm = i.leverAMm - i.leverCMm;
  const leverRatio = i.leverCMm / i.leverAMm;
  const horizontalAnchorForceKn =
    i.anchorForceKn * Math.cos((i.angleDeg * Math.PI) / 180);
  const supportReactionKn = horizontalAnchorForceKn * leverRatio;
  const lineLoadKnm = supportReactionKn / (i.reactionCoefficient * L);
  const momentKnm = i.momentCoefficient * lineLoadKnm * L ** 2;
  const shearKn = i.shearCoefficient * lineLoadKnm * L;
  const bendingStressMpa = (momentKnm * 1e6) / i.sectionModulusMm3;
  const shearStressMpa = (shearKn * 1000) / i.shearAreaMm2;
  const spanWidthRatio = i.spanMm / i.flangeWidthMm;
  const shortBranch = spanWidthRatio <= 4.5;
  const basicBendingMpa = shortBranch
    ? 160
    : 160 - 1.93333 * (spanWidthRatio - 4.5);
  const allowableBendingMpa =
    i.temporaryFactor * i.reuseFactor * basicBendingMpa;
  const allowableShearMpa = i.temporaryFactor * i.reuseFactor * 90;
  const bendingUtilization = bendingStressMpa / allowableBendingMpa;
  const shearUtilization = shearStressMpa / allowableShearMpa;
  const governingUtilization = Math.max(bendingUtilization, shearUtilization);
  const results = {
    leverBMm,
    leverRatio,
    horizontalAnchorForceKn,
    supportReactionKn,
    lineLoadKnm,
    momentKnm,
    shearKn,
    bendingStressMpa,
    shearStressMpa,
    spanWidthRatio,
    allowableBendingMpa,
    allowableShearMpa,
    bendingUtilization,
    shearUtilization,
    governingUtilization,
  };
  if (!Object.values(results).every(Number.isFinite))
    return {
      ok: false,
      errors: {
        calculation: "계산값이 표현 가능한 유한 수치 범위를 벗어났습니다.",
      },
    };

  const checks = [
    {
      key: "bending",
      label: "띠장 휨응력",
      value: bendingStressMpa,
      limit: allowableBendingMpa,
      unit: "MPa",
      relation: "<=",
      pass: bendingStressMpa <= allowableBendingMpa,
    },
    {
      key: "shear",
      label: "띠장 전단응력",
      value: shearStressMpa,
      limit: allowableShearMpa,
      unit: "MPa",
      relation: "<=",
      pass: shearStressMpa <= allowableShearMpa,
    },
  ];
  const step = (key, title, formula, substitution, value, unit) => ({
    key,
    title,
    formula,
    substitution,
    value,
    unit,
  });
  const steps = [
    step(
      "lever",
      "브래킷 기하와 반력 분담비",
      "b = a − c; 분담비 = c/a",
      `b = ${i.leverAMm} − ${i.leverCMm} = ${leverBMm} mm; c/a = ${i.leverCMm}/${i.leverAMm}`,
      leverRatio,
      "–",
    ),
    step(
      "horizontal",
      "앵커 수평성분",
      "Jh = Jf cosθ",
      `${i.anchorForceKn} × cos(${i.angleDeg}°)`,
      horizontalAnchorForceKn,
      "kN",
    ),
    step(
      "reaction",
      "채택 브래킷 분담 반력",
      "Rmax = Jf cosθ × c/a",
      `${horizontalAnchorForceKn} × ${i.leverCMm}/${i.leverAMm}`,
      supportReactionKn,
      "kN",
    ),
    step(
      "line-load",
      "채택 반력계수에서 선하중 환산",
      "w = Rmax / (kR L)",
      `${supportReactionKn} / (${i.reactionCoefficient} × ${L})`,
      lineLoadKnm,
      "kN/m",
    ),
    step(
      "moment",
      "채택 연속보 최대 휨모멘트",
      "Mmax = kM wL²",
      `${i.momentCoefficient} × ${lineLoadKnm} × ${L}²`,
      momentKnm,
      "kN·m",
    ),
    step(
      "shear-force",
      "채택 연속보 최대 전단력",
      "Vmax = kV wL",
      `${i.shearCoefficient} × ${lineLoadKnm} × ${L}`,
      shearKn,
      "kN",
    ),
    step(
      "bending-stress",
      "휨응력과 단위 환산",
      "fb = Mmax × 10⁶ / Zx",
      `${momentKnm} × 10⁶ / ${i.sectionModulusMm3}`,
      bendingStressMpa,
      "MPa",
    ),
    step(
      "shear-stress",
      "전단응력과 단위 환산",
      "τ = Vmax × 10³ / Aw",
      `${shearKn} × 10³ / ${i.shearAreaMm2}`,
      shearStressMpa,
      "MPa",
    ),
    step(
      "slenderness",
      "채택 허용휨식 적용 분기",
      "λb = L/B",
      `${i.spanMm}/${i.flangeWidthMm}; ${shortBranch ? "λb ≤ 4.5" : "4.5 < λb ≤ 30"}`,
      spanWidthRatio,
      "–",
    ),
    step(
      "allowable-bending",
      "채택 기본 휨허용값과 보정",
      shortBranch
        ? "fba = η × r × 160"
        : "fba = η × r × [160 − 1.93333(λb − 4.5)]",
      shortBranch
        ? `${i.temporaryFactor} × ${i.reuseFactor} × 160`
        : `${i.temporaryFactor} × ${i.reuseFactor} × [160 − 1.93333 × (${spanWidthRatio} − 4.5)]`,
      allowableBendingMpa,
      "MPa",
    ),
    step(
      "allowable-shear",
      "채택 기본 전단허용값과 보정",
      "τa = η × r × 90",
      `${i.temporaryFactor} × ${i.reuseFactor} × 90`,
      allowableShearMpa,
      "MPa",
    ),
    step(
      "bending-ratio",
      "휨 사용률",
      "ub = fb/fba",
      `${bendingStressMpa}/${allowableBendingMpa}`,
      bendingUtilization,
      "–",
    ),
    step(
      "shear-ratio",
      "전단 사용률",
      "uv = τ/τa",
      `${shearStressMpa}/${allowableShearMpa}`,
      shearUtilization,
      "–",
    ),
  ];
  const warnings = [
    "앵커 채택 축력 Jf는 직접 입력입니다. 앵커 모듈·굴착 단계·각도·토압을 바꾼 결과가 자동으로 연결되었다고 판단하지 마세요.",
    "채택 띠장 절의 휨·전단만 비교합니다. 축·조합·이음·브래킷·접합부·하단 띠장·변위·흙막이 전체 안정 및 외부 해석 실행은 포함하지 않습니다.",
    "L/B에 쓰는 길이는 채택대로 계산지간 L을 채택했습니다. 실제 횡지지조건과 현장 부재 연속성은 확인이 필요합니다.",
    "기본 허용응력식은 과거 채택 SS275 계열 채택식입니다. 단면·재료·보정계수 변경의 공학적 적용성은 별도 검토해야 합니다.",
  ];
  if (
    ["reactionCoefficient", "momentCoefficient", "shearCoefficient"].some(
      (key) => i[key] !== BASE[key],
    )
  )
    warnings.push(
      "연속보 계수를 채택 값에서 변경했습니다. 변경 계수는 사용자가 채택한 값이며 이 도구가 경계조건에서 해석하거나 검증한 결과가 아닙니다.",
    );
  return { ok: true, input, results, checks, steps, warnings };
}

export const FIELDS = fields;
