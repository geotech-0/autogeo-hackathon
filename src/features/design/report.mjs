import {
  MEMBER_IDS,
  MODULES,
  VERSION,
  computeWorkspace,
  restoreWorkspace,
} from "./model.mjs";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (n) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(n)
    : "—";
export function makeReport(raw, createdAt = new Date().toISOString()) {
  const state = restoreWorkspace(raw),
    results = computeWorkspace(state);
  if (MEMBER_IDS.some((id) => !results[id].ok))
    throw new Error("모든 부재의 입력을 확인한 후 보고서를 만드세요.");
  const sections = MEMBER_IDS.map((id) => {
    const m = MODULES[id],
      r = results[id];
    return `<section><h2>${esc(m.title)} <small>${r.status === "stale" ? "해석 재확인 필요" : r.status === "exceeded" ? "기준 초과" : "채택 기준 만족"}</small></h2><p>${esc(m.material)} · ${esc(m.scope)}</p><h3>입력과 채택 조건</h3><table><thead><tr><th>항목</th><th>입력값</th><th>단위 / 출처</th></tr></thead><tbody>${m.fields.map((f) => `<tr><td>${esc(f.label)}</td><td>${esc(state.members[id].values[f.key])}</td><td>${esc(state.members[id].quantities[f.key]?.unit || f.unit)}${f.group === "analysis" ? ` · ${esc(state.members[id].quantities[f.key].stage)} · ${esc(state.members[id].quantities[f.key].location)} · ${esc(state.members[id].quantities[f.key].evidence)}` : ""}</td></tr>`).join("")}${m.fixedRows.map((row) => `<tr><td>${esc(row[0])} <small>읽기 전용</small></td><td colspan="2">${esc(row[1])}</td></tr>`).join("")}</tbody></table>${r.dependencies.length ? `<p class="link">연결 하중: 앵커 Jf ${num(r.dependencies[0].value)} kN/개 · 앵커 입력 개정 ${r.dependencies[0].revision} · 연결 지문 ${esc(r.dependencies[0].fingerprint)}</p>` : ""}<h3>해석값 단위 변환</h3>${
      Object.values(r.quantities)
        .map(
          (q) =>
            `<p>${num(q.rawValue)} ${esc(q.rawUnit)} → ${num(q.value)} ${esc(q.unit)} · ${esc(q.basis)}<br><small>${esc(q.direction)} · ${esc(q.conversion)}</small></p>`,
        )
        .join("") || "<p>앵커 초기긴장력 Jf를 자동 연결합니다.</p>"
    }${id === "pile" ? `<p>채택 Qu 근거: ${esc(state.source.quEvidence)}</p>` : ""}<h3>검토 결과</h3><table><thead><tr><th>검토 항목</th><th>계산값</th><th>관계</th><th>허용 / 채택값</th><th>판정</th></tr></thead><tbody>${r.checks.map((c) => `<tr><td>${esc(c.label)}</td><td>${num(c.value)} ${esc(c.unit)}</td><td>${esc(c.relation)}</td><td>${num(c.limit)} ${esc(c.unit)}</td><td class="${c.pass ? "pass" : "fail"}">${c.pass ? "만족" : "초과"}</td></tr>`).join("")}</tbody></table><h3>계산 과정</h3>${r.steps.map((s, i) => `<div class="step"><b>${i + 1}. ${esc(s.title)}</b><code>${esc(s.formula)}</code><span>${esc(s.substitution)} = <strong>${num(s.value)} ${esc(s.unit)}</strong></span></div>`).join("")}<h3>적용 범위</h3><ul>${r.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul><p class="meta">부재 입력 개정 ${state.members[id].revision} · 계산 지문 ${esc(r.fingerprint)}</p></section>`;
  }).join("");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(state.label)} · AutoGeo</title><style>body{font-family:Arial,'Apple SD Gothic Neo',sans-serif;color:#202938;max-width:980px;margin:48px auto;padding:0 24px;font-size:13px;line-height:1.65}h1{font-size:30px}h2{font-size:24px;margin-top:44px;border-bottom:2px solid #0f6fff;padding-bottom:10px}h2 small{font-size:13px;color:#465a70}h3{font-size:16px;margin-top:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border-bottom:1px solid #dce2ea;padding:9px 10px;text-align:left}th{background:#eff4fb}small,.meta{color:#66758a}code{display:block;background:#f3f6fa;padding:7px;margin:5px 0;font-family:monospace}.step{break-inside:avoid;padding:9px 0}.pass{color:#16805b}.fail{color:#bd3549}.notice,.link{background:#eff5ff;padding:14px}.brand{letter-spacing:2px;color:#0f6fff;font-weight:bold}section{page-break-before:always}@media print{body{margin:0;padding:0}section:first-of-type{page-break-before:auto}h2{margin-top:20px}table,li{break-inside:avoid}}@page{size:A4;margin:18mm}</style><body><p class="brand">AUTOGEO / DESIGN REVIEW</p><h1>${esc(state.label)}</h1><p>A-01 굴착구역 · H-Pile + 토류판 + 어스앵커 · 4부재 검토</p><p class="notice">${state.source.origin === "synthetic" ? "합성 시연 데이터" : "사용자 채택 해석 데이터"} · 수동 입력한 외부 해석결과를 이용한 부재 후처리입니다. 외부 해석 재실행, 굴착 전체 안정성 및 최종 설계 승인을 포함하지 않습니다.</p><table><tr><th>자료</th><td>${esc(state.source.label)} (${esc(state.source.id)} / 개정 ${esc(state.source.revision)})</td></tr><tr><th>해석 모델</th><td>${esc(state.source.modelId)} / 개정 ${esc(state.source.modelRevision)} · ${esc(state.source.program)}</td></tr><tr><th>해석 상세</th><td>${esc(state.source.programVersion)} · 실행일 ${esc(state.source.runDate)} · ${esc(state.source.combination)}</td></tr><tr><th>자료 근거 / 입력자</th><td>${esc(state.source.evidence)} / ${esc(state.source.enteredBy)}</td></tr><tr><th>계산방법</th><td>${esc(VERSION)} · 허용응력 기반 채택 방법</td></tr><tr><th>생성 시각</th><td>${esc(createdAt)}</td></tr></table>${sections}<footer><p>AutoGeo · 입력·단위·방법·개정을 함께 보존한 검토 기록</p></footer></body></html>`;
}
