// Pure calculation core adapted from the existing member engines.
// Project presets, document identifiers, and report serializers are intentionally excluded.
const FIELDS = [
  {
    key: "spacingM",
    label: "말뚝 수평간격 s",
    unit: "m",
    min: 0.1,
    max: 20,
    step: 0.01,
    group: "해석결과·작용력",
    hint: "단위 폭당 M·V에 곱합니다. 변경해도 기존 해석 분포는 갱신되지 않습니다.",
  },
  {
    key: "axialForceKn",
    label: "채택 압축축력 N (말뚝 1본)",
    unit: "kN",
    min: 0,
    max: 100000,
    step: 1,
    group: "해석결과·작용력",
    hint: "출처가 확인된 말뚝 1본의 압축축력입니다. 앵커 축력의 합산값이 아닙니다.",
  },
  {
    key: "momentPerMKnm",
    label: "해석 최대모멘트 크기 |M′|",
    unit: "kN·m/m",
    min: 0,
    max: 100000,
    step: 0.001,
    group: "해석결과·작용력",
    hint: "원래 해석의 단위 폭당 채택값. 부재 1본 값과 구별합니다.",
  },
  {
    key: "shearPerMKn",
    label: "해석 최대전단력 크기 |V′|",
    unit: "kN/m",
    min: 0,
    max: 100000,
    step: 0.001,
    group: "해석결과·작용력",
    hint: "M과 다른 단계의 최대값일 수 있습니다.",
  },
  {
    key: "areaMm2",
    label: "강재 총단면적 A",
    unit: "mm²",
    min: 1,
    max: 1000000,
    step: 1,
    group: "강재 단면·지지조건",
  },
  {
    key: "sectionModulusMm3",
    label: "강축 단면계수 Zx",
    unit: "mm³",
    min: 1,
    max: 1000000000,
    step: 100,
    group: "강재 단면·지지조건",
  },
  {
    key: "webAreaMm2",
    label: "전단 유효단면적 Aw",
    unit: "mm²",
    min: 1,
    max: 1000000,
    step: 1,
    group: "강재 단면·지지조건",
  },
  {
    key: "radiusMm",
    label: "채택 회전반경 Rx",
    unit: "mm",
    min: 0.1,
    max: 2000,
    step: 0.1,
    group: "강재 단면·지지조건",
    hint: "채택은 Rx로 검토합니다. 약축·지지조건의 별도 검토를 대신하지 않습니다.",
  },
  {
    key: "effectiveLengthMm",
    label: "축좌굴 유효길이 Lc",
    unit: "mm",
    min: 1,
    max: 100000,
    step: 10,
    group: "강재 단면·지지조건",
  },
  {
    key: "unbracedLengthMm",
    label: "압축플랜지 고정점간 거리 Lb",
    unit: "mm",
    min: 1,
    max: 100000,
    step: 10,
    group: "강재 단면·지지조건",
    hint: "채택은 Lc와 같은 값. 별도 지지조건을 채택하면 근거가 필요합니다.",
  },
  {
    key: "flangeWidthMm",
    label: "압축플랜지 폭 b",
    unit: "mm",
    min: 1,
    max: 2000,
    step: 1,
    group: "강재 단면·지지조건",
  },
  {
    key: "allowableFactor",
    label: "허용응력 보정계수",
    unit: "배",
    min: 1,
    max: 1.5,
    step: 0.05,
    group: "채택 허용응력 기준",
    hint: "채택 가설 1.5. 계수 변경만으로 영구 구조물 적합성이 확인되지는 않습니다.",
  },
  {
    key: "reuseFactor",
    label: "재사용·부식 저감계수",
    unit: "배",
    min: 0.01,
    max: 1,
    step: 0.01,
    group: "채택 허용응력 기준",
    hint: "채택 0.9. 재료는 채택 SHP275(W) 계열 허용응력으로 고정합니다.",
  },
  {
    key: "displacementMm",
    label: "해석 최대수평변위 크기 |δ|",
    unit: "mm",
    min: 0,
    max: 10000,
    step: 0.1,
    group: "수평변위",
  },
  {
    key: "excavationDepthM",
    label: "허용변위용 최종 굴착깊이 H",
    unit: "m",
    min: 0.01,
    max: 100,
    step: 0.01,
    group: "수평변위",
    hint: "변위 재해석용 입력이 아닌 허용변위 산정값입니다.",
  },
  {
    key: "displacementLimitPercent",
    label: "굴착깊이 대비 허용변위율",
    unit: "%",
    min: 0.001,
    max: 5,
    step: 0.01,
    group: "수평변위",
    hint: "채택 0.3%. 현장 관리기준 확정을 의미하지 않습니다.",
  },
  {
    key: "ultimateBearingKn",
    label: "채택 극한지지력 Qu",
    unit: "kN",
    min: 0,
    max: 10000000,
    step: 1,
    group: "지반지지력 직접 입력",
  },
  {
    key: "bearingSafetyFactor",
    label: "지지력 안전율 Fs",
    unit: "배",
    min: 1,
    max: 10,
    step: 0.1,
    group: "채택 지반지지력 경험식",
  },
];

const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;
function readNumber(raw) {
  if (typeof raw === "number")
    return Number.isFinite(raw) ? (raw === 0 ? 0 : raw) : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!DECIMAL_NUMBER.test(text)) return null;
  const value = Number(text);
  if (
    !Number.isFinite(value) ||
    (value === 0 && /[1-9]/u.test(text.split(/[eE]/u)[0]))
  )
    return null;
  return value === 0 ? 0 : value;
}
const fmt = (value) => Number(value.toPrecision(10)).toString();

export function calculate(rawInput) {
  const raw =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? rawInput
      : {};
  const input = {},
    errors = {};
  for (const field of FIELDS) {
    const value = readNumber(raw[field.key]);
    if (value === null)
      errors[field.key] = `${field.label}: 유한한 숫자를 입력하세요.`;
    else if (value < field.min || value > field.max)
      errors[field.key] =
        `${field.label}: ${field.min}~${field.max} ${field.unit} 범위로 입력하세요. (소프트웨어 운영 범위)`;
    else input[field.key] = value;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const x = input;
  if (x.webAreaMm2 > x.areaMm2)
    errors.webAreaMm2 = "전단 유효단면적 Aw는 강재 총단면적 A 이하여야 합니다.";
  if (x.flangeWidthMm >= x.spacingM * 1000)
    errors.spacingM = "말뚝 수평간격은 플랜지 폭보다 커야 합니다.";
  const slenderness = x.effectiveLengthMm / x.radiusMm;
  const flangeSlenderness = x.unbracedLengthMm / x.flangeWidthMm;
  if (flangeSlenderness > 30)
    errors.unbracedLengthMm =
      "Lb/b > 30 구간은 채택 허용휨응력식에 없습니다. 지지조건과 적용 설계기준을 확인하세요.";
  const factor = x.allowableFactor * x.reuseFactor;
  const compressionStressMpa = (x.axialForceKn * 1000) / x.areaMm2;
  const eulerAllowableMpa = (factor * 1200000) / slenderness ** 2;
  if (compressionStressMpa >= eulerAllowableMpa)
    errors.axialForceKn =
      "fc ≥ feax로 채택 합성응력식의 분모가 0 이하입니다. 좌굴 조건 불만족/식 적용 불가이며 통과 판정을 할 수 없습니다.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const momentKnm = x.momentPerMKnm * x.spacingM;
  const shearKn = x.shearPerMKn * x.spacingM;
  const bendingStressMpa = (momentKnm * 1000000) / x.sectionModulusMm3;
  const shearStressMpa = (shearKn * 1000) / x.webAreaMm2;
  const compressionBaseMpa =
    slenderness <= 20
      ? 160
      : slenderness <= 90
        ? 160 - (slenderness - 20)
        : 1250000 / (6000 + slenderness ** 2);
  const compressionAllowableMpa = factor * compressionBaseMpa;
  const bendingBaseMpa =
    flangeSlenderness <= 4.5 ? 160 : 160 - 1.93333 * (flangeSlenderness - 4.5);
  const bendingAllowableMpa = factor * bendingBaseMpa;
  const shearAllowableMpa = factor * 90;
  const interactionDenominator = 1 - compressionStressMpa / eulerAllowableMpa;
  const interaction =
    compressionStressMpa / compressionAllowableMpa +
    bendingStressMpa / (bendingAllowableMpa * interactionDenominator);
  const displacementLimitMm =
    (x.excavationDepthM * 1000 * x.displacementLimitPercent) / 100;
  const ultimateBearingKn = x.ultimateBearingKn;
  const allowableBearingKn = ultimateBearingKn / x.bearingSafetyFactor;
  const results = {
    axialForceKn: x.axialForceKn,
    momentKnm,
    shearKn,
    slenderness,
    flangeSlenderness,
    compressionStressMpa,
    bendingStressMpa,
    shearStressMpa,
    compressionAllowableMpa,
    bendingAllowableMpa,
    shearAllowableMpa,
    eulerAllowableMpa,
    interactionDenominator,
    interaction,
    displacementMm: x.displacementMm,
    displacementLimitMm,
    ultimateBearingKn,
    allowableBearingKn,
  };
  if (!Object.values(results).every(Number.isFinite))
    return {
      ok: false,
      errors: { calculation: "계산 결과가 유한한 수치 범위를 벗어났습니다." },
    };
  const check = (key, label, value, limit, unit) => ({
    key,
    label,
    value,
    limit,
    unit,
    relation: "<=",
    pass: value <= limit,
  });
  const checks = [
    check(
      "compression",
      "압축응력",
      compressionStressMpa,
      compressionAllowableMpa,
      "MPa",
    ),
    check("bending", "휨응력", bendingStressMpa, bendingAllowableMpa, "MPa"),
    check("shear", "전단응력", shearStressMpa, shearAllowableMpa, "MPa"),
    check("interaction", "압축·휨 합성응력비", interaction, 1, "—"),
    check(
      "displacement",
      "수평변위",
      x.displacementMm,
      displacementLimitMm,
      "mm",
    ),
    check(
      "bearing",
      "축력 / 허용지반지지력",
      x.axialForceKn,
      allowableBearingKn,
      "kN",
    ),
  ];
  const step = (key, title, formula, substitution, value, unit) => ({
    key,
    title,
    formula,
    substitution,
    value,
    unit,
  });
  const compressionFormula =
    slenderness <= 20
      ? "fca = α·η·160 (λ ≤ 20)"
      : slenderness <= 90
        ? "fca = α·η·[160 − (λ − 20)] (20 < λ ≤ 90)"
        : "fca = α·η·1250000/(6000 + λ²) (λ > 90; 채택 방법)";
  const compressionSubstitution =
    slenderness <= 20
      ? `${fmt(x.allowableFactor)} × ${fmt(x.reuseFactor)} × 160`
      : slenderness <= 90
        ? `${fmt(factor)} × [160 − (${fmt(slenderness)} − 20)]`
        : `${fmt(factor)} × 1250000 / (6000 + ${fmt(slenderness)}²)`;
  const steps = [
    step(
      "axialForceKn",
      "출처를 유지한 채택 압축축력",
      "N = 채택 축력 (말뚝 1본)",
      `${fmt(x.axialForceKn)} kN; 압축축력 채택값`,
      x.axialForceKn,
      "kN",
    ),
    step(
      "momentKnm",
      "단위 폭당 모멘트 → 말뚝 1본",
      "M = |M′| × s",
      `${fmt(x.momentPerMKnm)} × ${fmt(x.spacingM)}`,
      momentKnm,
      "kN·m",
    ),
    step(
      "shearKn",
      "단위 폭당 전단력 → 말뚝 1본",
      "V = |V′| × s",
      `${fmt(x.shearPerMKn)} × ${fmt(x.spacingM)}`,
      shearKn,
      "kN",
    ),
    step(
      "compressionStressMpa",
      "작용 압축응력",
      "fc = N × 1000 / A",
      `${fmt(x.axialForceKn)} × 1000 / ${fmt(x.areaMm2)}`,
      compressionStressMpa,
      "MPa",
    ),
    step(
      "bendingStressMpa",
      "작용 휨응력",
      "fb = M × 10⁶ / Zx",
      `${fmt(momentKnm)} × 1000000 / ${fmt(x.sectionModulusMm3)}`,
      bendingStressMpa,
      "MPa",
    ),
    step(
      "shearStressMpa",
      "작용 전단응력",
      "τ = V × 1000 / Aw",
      `${fmt(shearKn)} × 1000 / ${fmt(x.webAreaMm2)}`,
      shearStressMpa,
      "MPa",
    ),
    step(
      "slenderness",
      "축좌굴 세장비",
      "λ = Lc / Rx",
      `${fmt(x.effectiveLengthMm)} / ${fmt(x.radiusMm)}`,
      slenderness,
      "—",
    ),
    step(
      "compressionAllowableMpa",
      "세장비 분기 허용압축응력",
      compressionFormula,
      compressionSubstitution,
      compressionAllowableMpa,
      "MPa",
    ),
    step(
      "flangeSlenderness",
      "압축플랜지 비지지길이 비",
      "β = Lb / b",
      `${fmt(x.unbracedLengthMm)} / ${fmt(x.flangeWidthMm)}`,
      flangeSlenderness,
      "—",
    ),
    step(
      "bendingAllowableMpa",
      "허용휨압축응력",
      flangeSlenderness <= 4.5
        ? "fba = α·η·160 (β ≤ 4.5)"
        : "fba = α·η·[160 − 1.93333(β − 4.5)] (4.5 < β ≤ 30)",
      flangeSlenderness <= 4.5
        ? `${fmt(factor)} × 160`
        : `${fmt(factor)} × [160 − 1.93333 × (${fmt(flangeSlenderness)} − 4.5)]`,
      bendingAllowableMpa,
      "MPa",
    ),
    step(
      "eulerAllowableMpa",
      "채택 탄성좌굴 관련 응력",
      "feax = α·η·1200000 / λ²",
      `${fmt(factor)} × 1200000 / ${fmt(slenderness)}²`,
      eulerAllowableMpa,
      "MPa",
    ),
    step(
      "shearAllowableMpa",
      "허용전단응력",
      "τa = α·η·90",
      `${fmt(factor)} × 90`,
      shearAllowableMpa,
      "MPa",
    ),
    step(
      "interaction",
      "채택 압축·휨 합성응력비",
      "fc/fca + fb/[fba × (1 − fc/feax)]",
      `${fmt(compressionStressMpa)}/${fmt(compressionAllowableMpa)} + ${fmt(bendingStressMpa)}/[${fmt(bendingAllowableMpa)} × (1 − ${fmt(compressionStressMpa)}/${fmt(eulerAllowableMpa)})]`,
      interaction,
      "—",
    ),
    step(
      "displacementLimitMm",
      "허용수평변위",
      "δa = H × 1000 × 허용변위율/100",
      `${fmt(x.excavationDepthM)} × 1000 × ${fmt(x.displacementLimitPercent)}/100`,
      displacementLimitMm,
      "mm",
    ),
    step(
      "ultimateBearingKn",
      "직접 채택한 극한지지력",
      "Qu = 사용자 채택 극한지지력",
      `${fmt(x.ultimateBearingKn)} kN`,
      x.ultimateBearingKn,
      "kN",
    ),
    step(
      "allowableBearingKn",
      "허용지반지지력",
      "Qua = Qu,kN / Fs",
      `${fmt(ultimateBearingKn)} / ${fmt(x.bearingSafetyFactor)}`,
      allowableBearingKn,
      "kN",
    ),
  ];
  const warnings = [
    "현재 입력의 채택 N·M′·V′·변위에 대한 후처리입니다. 지반·굴착·단면·간격 변경에 따른 외부 해석 재해석 결과가 아닙니다.",
    "채택 각 성분 최대값에 의한 포락 부재검토입니다. 하중별 지배 시공단계가 달라 실제 동시 단면력 또는 동일 단계의 거동을 뜻하지 않습니다.",
    "극한지지력 Qu는 직접 채택한 입력이며 SPT 경험식 산출과 혼합하지 않습니다. 허용지지력은 Qu/Fs입니다.",
  ];
  if (x.allowableFactor !== 1.5 || x.reuseFactor !== 0.9)
    warnings.push(
      "채택 보정계수(1.5 × 0.9)를 변경했습니다. 계수의 적용 근거와 구조물 조건을 별도로 확인하세요.",
    );
  if (x.displacementLimitPercent !== 0.3)
    warnings.push(
      "채택 허용변위율 0.3%를 변경했습니다. 현장 계측 관리기준과 설계 허용변위의 근거를 별도로 확인하세요.",
    );
  if (slenderness > 90)
    warnings.push(
      "λ > 90의 허용압축응력은 채택 방법의 가설계수 포함식을 기본식으로 환산해 적용했습니다. 적용 범위를 확인하세요.",
    );
  if (ultimateBearingKn === 0)
    warnings.push(
      "직접 채택한 지지력은 0입니다. 양의 압축축력에 대한 지지력 검토는 불만족입니다.",
    );
  return { ok: true, input, results, checks, steps, warnings };
}

export { FIELDS };
