// Pure calculation core adapted from the existing member engines.
// Project presets, document identifiers, and report serializers are intentionally excluded.
const field = (key, label, unit, min, max, step, group, hint) => ({ key, label, unit, min, max, step, group, ...(hint ? { hint } : {}) });
const fields = [
  field('reactionKnPerM', '최대 축방향 반력', 'kN/m', 0, 1000000, 0.001, '하중·강연선', '경사 효과가 이미 반영된 외부 해석 반력. 수평 반력을 그대로 입력하지 않습니다.'),
  field('spacingM', '앵커 수평간격', 'm', 0.001, 100, 0.01, '하중·강연선'),
  field('strandCount', '사용 강연선 수', '본', 1, 1000, 1, '하중·강연선', '양의 정수. 본수를 변경하면 긴장손실과 정착 길이도 재계산합니다.'),
  field('strandAreaMm2', '강연선 1본 단면적', 'mm²', 0.001, 100000, 0.01, '하중·강연선', '총단면적이 아닙니다. 채택 98.71 mm² × 4본 = 394.84 mm².'),
  field('strandDiameterMm', '강연선 1본 지름', 'mm', 0.001, 1000, 0.01, '하중·강연선'),
  field('yieldStrengthMpa', '항복강도 fpy', 'MPa', 0.001, 100000, 1, '재료·허용계수'),
  field('ultimateStrengthMpa', '극한강도 fpu', 'MPa', 0.001, 100000, 1, '재료·허용계수'),
  field('yieldAllowFactor', '항복강도 허용계수', '-', 0.001, 1, 0.01, '재료·허용계수', '채택 일시 앵커 채택값 0.80. 현행 기준을 자동 선택하지 않습니다.'),
  field('ultimateAllowFactor', '극한강도 허용계수', '-', 0.001, 1, 0.01, '재료·허용계수', '채택 일시 앵커 채택값 0.65.'),
  field('elasticModulusMpa', '강연선 탄성계수 Ep', 'MPa', 0.001, 10000000, 1000, '긴장손실'),
  field('slipMm', '정착장치 활동량 ΔL', 'mm', 0, 1000, 0.1, '긴장손실'),
  field('relaxationPercent', '겉보기 relaxation', '%', 0, 100, 0.1, '긴장손실'),
  field('relaxationStressFactor', 'relaxation 기준응력 / fpy', '-', 0, 1, 0.01, '긴장손실', '채택은 실제 T/A 대신 0.80 fpy를 채택합니다.'),
  field('stressExtraLengthM', '손실·신장 계산 추가길이', 'm', 0, 100, 0.1, '긴장손실', '채택 0.5 m. 총 소요장 여유장 1.5 m와 별개입니다.'),
  field('geometricFreeLengthM', '파괴면까지 필요 자유장', 'm', 0, 1000, 0.001, '자유장·채택 길이', '채택 도식 또는 별도 기하검토로 정한 길이. 다층 파괴면을 자동 계산하지 않습니다.'),
  field('freeSafetyDistanceM', '자유장 안전거리', 'm', 0, 100, 0.1, '자유장·채택 길이'),
  field('adoptedFreeLengthM', '채택 자유장', 'm', 0.001, 1000, 0.1, '자유장·채택 길이'),
  field('adoptedAnchorageLengthM', '채택 정착장', 'm', 0.001, 1000, 0.1, '자유장·채택 길이'),
  field('totalExtraLengthM', '총 소요장 여유장', 'm', 0, 100, 0.1, '자유장·채택 길이', '채택 1.5 m. 손실·신장 계산에는 별도 추가길이를 사용합니다.'),
  field('boreDiameterMm', '앵커체 지름 D', 'mm', 0.001, 10000, 1, '정착 저항'),
  field('groundFrictionKpa', '지반 주면마찰저항 τu', 'kPa', 0.001, 1000000, 1, '정착 저항', '지층별 채택값. N값이나 토질명으로 자동 결정하지 않습니다.'),
  field('bondStressKpa', '인장재 허용부착응력 τa', 'kPa', 0.001, 1000000, 1, '정착 저항'),
  field('pulloutSafetyFactor', '극한 인발력 안전율', '-', 1, 100, 0.1, '정착 저항'),
  field('minimumAnchorageLengthM', '채택 정착장 하한', 'm', 0, 1000, 0.1, '정착 저항', '채택의 3–10 m 범위를 채택값으로 노출합니다. 현재 기준의 자동 판정이 아닙니다.'),
  field('maximumAnchorageLengthM', '채택 정착장 상한', 'm', 0.001, 1000, 0.1, '정착 저항'),
];

const numericPattern = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const format = value => String(value);

export function calculate(raw) {
  const errors = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: { _form: '앵커 입력 객체가 필요합니다.' } };
  const input = {};
  for (const f of fields) {
    const value = Object.hasOwn(raw, f.key) ? raw[f.key] : undefined;
    const validString = typeof value === 'string' && numericPattern.test(value.trim());
    if ((typeof value !== 'number' && !validString) || !Number.isFinite(Number(value))) {
      errors[f.key] = `${f.label}: 빈칸이 아닌 유한한 숫자를 입력하세요.`;
      continue;
    }
    const number = Number(value);
    if (number < f.min || number > f.max) errors[f.key] = `${f.label}: 도구 운영 범위 ${f.min}–${f.max} ${f.unit} 안의 값을 입력하세요.`;
    input[f.key] = number;
  }
  for (const key of Object.keys(raw)) if (!fields.some(f => f.key === key)) errors[key] = '지원하지 않는 입력 항목입니다.';
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!Number.isInteger(input.strandCount)) errors.strandCount = '강연선 수는 양의 정수여야 합니다.';
  if (input.yieldStrengthMpa > input.ultimateStrengthMpa) errors.yieldStrengthMpa = '항복강도는 극한강도보다 클 수 없습니다.';
  if (input.boreDiameterMm <= input.strandDiameterMm) errors.boreDiameterMm = '앵커체 지름은 강연선 1본 지름보다 커야 합니다.';
  if (input.minimumAnchorageLengthM > input.maximumAnchorageLengthM) errors.minimumAnchorageLengthM = '정착장 하한은 상한 이하여야 합니다.';
  if (Object.keys(errors).length) return { ok: false, errors };

  const x = input;
  const results = {};
  const steps = [];
  const step = (key, title, formula, substitution, value, unit) => {
    results[key] = value;
    steps.push({ key, title, formula, substitution, value, unit });
    return value;
  };
  const v = key => format(x[key]);
  const A = step('totalAreaMm2', '강연선 총단면적', 'A_total = A_1 × N', `${v('strandAreaMm2')} × ${v('strandCount')}`, x.strandAreaMm2 * x.strandCount, 'mm²');
  const stress = step('allowableStressMpa', '허용인장응력', 'f_allow = min(k_u fpu, k_y fpy)', `min(${v('ultimateAllowFactor')} × ${v('ultimateStrengthMpa')}, ${v('yieldAllowFactor')} × ${v('yieldStrengthMpa')})`, Math.min(x.ultimateAllowFactor * x.ultimateStrengthMpa, x.yieldAllowFactor * x.yieldStrengthMpa), 'MPa');
  const Pa1 = step('allowablePerStrandKn', '1본 허용인장력', 'Pa_1 = f_allow × A_1 / 1000', `${format(stress)} × ${v('strandAreaMm2')} / 1000`, stress * x.strandAreaMm2 / 1000, 'kN');
  const Pa = step('allowableTotalKn', '총 허용인장력', 'Pa_total = Pa_1 × N', `${format(Pa1)} × ${v('strandCount')}`, Pa1 * x.strandCount, 'kN');
  const requiredFree = step('requiredFreeLengthM', '기하 채택값 + 안전거리', 'Lf_req = L_geometry(adopted) + Lu', `${v('geometricFreeLengthM')} + ${v('freeSafetyDistanceM')}`, x.geometricFreeLengthM + x.freeSafetyDistanceM, 'm');
  const T = step('designForceKn', '소요 설계축력', 'Treq = Rmax(axial) × s', `${v('reactionKnPerM')} × ${v('spacingM')}`, x.reactionKnPerM * x.spacingM, 'kN');
  const L = step('stressLengthM', '손실·신장 계산 길이', 'L_stress = Lf + La + L_stress_extra', `${v('adoptedFreeLengthM')} + ${v('adoptedAnchorageLengthM')} + ${v('stressExtraLengthM')}`, x.adoptedFreeLengthM + x.adoptedAnchorageLengthM + x.stressExtraLengthM, 'm');
  const slip = step('slipLossKn', '정착장치 활동 손실', 'ΔP_slip[kN] = Ep[MPa] × ΔL[mm] × A_total[mm²] / (L_stress[m] × 10⁶)', `${v('elasticModulusMpa')} × ${v('slipMm')} × ${format(A)} / (${format(L)} × 1000000)`, x.elasticModulusMpa * x.slipMm * A / (L * 1e6), 'kN');
  const relaxationStress = step('relaxationStressMpa', 'relaxation 기준응력', 'fpt = k_relax × fpy', `${v('relaxationStressFactor')} × ${v('yieldStrengthMpa')}`, x.relaxationStressFactor * x.yieldStrengthMpa, 'MPa');
  const relax = step('relaxationLossKn', 'relaxation 손실', 'ΔP_relax[kN] = (r[%]/100) × fpt × A_total / 1000', `(${v('relaxationPercent')} / 100) × ${format(relaxationStress)} × ${format(A)} / 1000`, x.relaxationPercent / 100 * relaxationStress * A / 1000, 'kN');
  const J = step('jackingForceKn', '손실을 포함한 초기 긴장력', 'JF = Treq + ΔP_slip + ΔP_relax', `${format(T)} + ${format(slip)} + ${format(relax)}`, T + slip + relax, 'kN');
  const n = step('requiredStrandCount', '현재 사용 본수 조건의 소요수', 'n_req = JF / Pa_1', `${format(J)} / ${format(Pa1)}`, J / Pa1, '본');
  step('requiredStrandsCeil', '현재 조건 소요수 올림', 'N_req = ceil(n_req)', `ceil(${format(n)})`, Math.ceil(n), '본');
  const La1 = step('frictionLengthM', '지반 마찰저항장', 'La1 = Treq × Fs / (π × (D/1000) × τu)', `${format(T)} × ${v('pulloutSafetyFactor')} / (π × (${v('boreDiameterMm')} / 1000) × ${v('groundFrictionKpa')})`, T * x.pulloutSafetyFactor / (Math.PI * x.boreDiameterMm / 1000 * x.groundFrictionKpa), 'm');
  const La2 = step('bondLengthM', '인장재 부착저항장', 'La2 = Treq / (π × N × (Ds/1000) × τa)', `${format(T)} / (π × ${v('strandCount')} × (${v('strandDiameterMm')} / 1000) × ${v('bondStressKpa')})`, T / (Math.PI * x.strandCount * x.strandDiameterMm / 1000 * x.bondStressKpa), 'm');
  const governing = step('governingAnchorageLengthM', '두 저항 길이 중 큰 값', 'La_resistance = max(La1, La2)', `max(${format(La1)}, ${format(La2)})`, Math.max(La1, La2), 'm');
  const requiredAnchorage = step('requiredAnchorageLengthM', '채택 하한을 포함한 필요 정착장', 'La_req = max(La1, La2, La_min)', `max(${format(La1)}, ${format(La2)}, ${v('minimumAnchorageLengthM')})`, Math.max(governing, x.minimumAnchorageLengthM), 'm');
  step('totalLengthM', '총 소요장', 'L_total = Lf + La + Le', `${v('adoptedFreeLengthM')} + ${v('adoptedAnchorageLengthM')} + ${v('totalExtraLengthM')}`, x.adoptedFreeLengthM + x.adoptedAnchorageLengthM + x.totalExtraLengthM, 'm');
  step('elongationMm', '초기 긴장 시 신장량', 'δ[mm] = JF[kN] × L_stress[m] × 10⁶ / (Ep × A_total)', `${format(J)} × ${format(L)} × 1000000 / (${v('elasticModulusMpa')} × ${format(A)})`, J * L * 1e6 / (x.elasticModulusMpa * A), 'mm');
  step('tensionUtilization', '채택 인장력 사용률', 'u = JF / Pa_total', `${format(J)} / ${format(Pa)}`, J / Pa, '-');

  if (Object.values(results).some(value => !Number.isFinite(value))) return { ok: false, errors: { _form: '계산 결과가 유한 범위를 벗어났습니다. 입력 단위와 크기를 확인하세요.' } };
  const check = (key, label, value, limit, unit, relation = '<=') => ({ key, label, value, limit, unit, relation, pass: relation === '<=' ? value <= limit : value >= limit });
  const checks = [
    check('tension', '초기 긴장력 / 채택 총 허용인장력', J, Pa, 'kN'),
    check('strands', '현재 조건 소요 강연선 수 / 사용 본수', n, x.strandCount, '본'),
    check('free-length', '필요 자유장 + 안전거리 / 채택 자유장', requiredFree, x.adoptedFreeLengthM, 'm'),
    check('friction-length', '마찰저항장 / 채택 정착장', La1, x.adoptedAnchorageLengthM, 'm'),
    check('bond-length', '부착저항장 / 채택 정착장', La2, x.adoptedAnchorageLengthM, 'm'),
    check('anchorage-min', '채택 정착장 / 채택 하한', x.adoptedAnchorageLengthM, x.minimumAnchorageLengthM, 'm', '>='),
    check('anchorage-max', '채택 정착장 / 채택 상한', x.adoptedAnchorageLengthM, x.maximumAnchorageLengthM, 'm'),
    check('anchorage-demand-range', '필요 정착장 / 채택 상한', requiredAnchorage, x.maximumAnchorageLengthM, 'm'),
  ];
  const warnings = [
    '자유장 기하값과 축방향 반력은 채택 입력입니다. 지층·굴착단계·설치각을 바꾼 외부 해석이나 파괴면 계산은 수행하지 않습니다.',
    '소요 강연선 수는 현재 사용 본수의 긴장손실을 포함한 값입니다. 올림값을 자동 채택하지 않으며 본수 변경 후 다시 검토해야 합니다.',
    '인장력·정착장 비교는 입력된 허용값과 채택 계산 모형에 대한 비교입니다. 현장 전체 안전 또는 현행 KDS 적합성 판정이 아닙니다.',
  ];
  if (La2 > La1) warnings.push('부착저항장 La2가 지반 마찰저항장 La1보다 큽니다. 정착장 검토는 둘 중 큰 값을 사용했습니다.');
  if (requiredAnchorage > x.maximumAnchorageLengthM) warnings.push('필요 정착장이 채택 상한을 초과합니다. 상한으로 잘라서 통과 처리하지 않았습니다.');
  return { ok: true, input, results, checks, steps, warnings };
}

export const FIELDS = fields;
