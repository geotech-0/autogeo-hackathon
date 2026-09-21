// Pure calculation core adapted from the existing member engines.
// Project presets, document identifiers, and report serializers are intentionally excluded.
export const FIELDS = Object.freeze(
  [
    {
      key: "pressureKpa",
      label: "토류판 적용 토압 p",
      unit: "kPa",
      min: 0,
      max: 1000,
      step: 0.1,
    },
    {
      key: "heightMm",
      label: "토류판 높이 H",
      unit: "mm",
      min: 10,
      max: 1000,
      step: 1,
    },
    {
      key: "thicknessMm",
      label: "토류판 두께 t",
      unit: "mm",
      min: 5,
      max: 1000,
      step: 1,
    },
    {
      key: "spacingMm",
      label: "H-Pile 수평간격 s",
      unit: "mm",
      min: 100,
      max: 10000,
      step: 10,
    },
    {
      key: "pileWidthMm",
      label: "H-Pile 폭 b",
      unit: "mm",
      min: 10,
      max: 2000,
      step: 10,
    },
    {
      key: "allowableMpa",
      label: "허용휨응력 fba",
      unit: "MPa",
      min: 0.1,
      max: 100,
      step: 0.1,
    },
  ].map(Object.freeze),
);

const DECIMAL_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u;

function readNumber(raw) {
  if (typeof raw === "number")
    return Number.isFinite(raw) ? (raw === 0 ? 0 : raw) : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!DECIMAL_NUMBER.test(text)) return null;
  const number = Number(text);
  if (!Number.isFinite(number)) return null;
  // Do not silently turn a nonzero text input into zero through underflow.
  if (number === 0 && /[1-9]/u.test(text.split(/[eE]/u)[0])) return null;
  return number === 0 ? 0 : number;
}

export function calculate(rawInput) {
  const input = {};
  const errors = {};
  const raw =
    rawInput && typeof rawInput === "object" && !Array.isArray(rawInput)
      ? rawInput
      : {};
  for (const field of FIELDS) {
    const value = readNumber(raw[field.key]);
    if (value === null) {
      errors[field.key] = `${field.label}: 유한한 숫자를 입력하세요.`;
    } else if (value < field.min || value > field.max) {
      errors[field.key] =
        `${field.label}: ${field.min}~${field.max} ${field.unit} 범위로 입력하세요. (소프트웨어 운영 범위)`;
    } else {
      input[field.key] = value;
    }
  }
  if (
    !errors.spacingMm &&
    !errors.pileWidthMm &&
    input.spacingMm <= input.pileWidthMm
  ) {
    errors.spacingMm = "H-Pile 수평간격 s는 H-Pile 폭 b보다 커야 합니다.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const {
    pressureKpa: p,
    heightMm: h,
    thicknessMm: t,
    spacingMm: s,
    pileWidthMm: b,
    allowableMpa: fba,
  } = input;
  const spanMm = s - 0.75 * b; // Source document's adopted design span.
  const lineLoadKnm = (p * h) / 1000; // kPa = kN/m²; h: mm → m.
  const momentKnm = (lineLoadKnm * (spanMm / 1000) ** 2) / 8;
  const sectionModulusMm3 = (h * t ** 2) / 6;
  const stressMpa = (momentKnm * 1e6) / sectionModulusMm3; // kN·m → N·mm.
  const requiredThicknessMm = Math.sqrt((6 * momentKnm * 1e6) / (h * fba));
  const utilization = stressMpa / fba;
  const results = {
    spanMm,
    lineLoadKnm,
    momentKnm,
    sectionModulusMm3,
    stressMpa,
    requiredThicknessMm,
    utilization,
  };
  // Defensive check in case operating limits change in a future version.
  if (!Object.values(results).every(Number.isFinite)) {
    return {
      ok: false,
      errors: {
        calculation:
          "계산값이 표현 가능한 수치 범위를 벗어났습니다. 입력값을 확인하세요.",
      },
    };
  }
  results.withinBendingLimit = stressMpa <= fba;
  return { ok: true, input, results, errors: {} };
}
