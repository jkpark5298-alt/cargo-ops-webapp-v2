// Monthly Scheduled Flight 화면 jsdom 시나리오 테스트
// 사용 (frontend 폴더에서): node scripts/monthly-ui-test.cjs .
// jsdom 에서 세 화면(홈 / 편명조회 / AFOCS SKD)을 실제로 렌더링(효과 포함)하고 화면·fetch 호출을 기록한다.
// 사용 (frontend 폴더에서): npm i --no-save jsdom && node scripts/render-smoke.cjs . result.json
// 리팩터링 전/후 코드로 각각 실행해 결과 JSON을 diff 하면 화면·API 호출·저장 데이터 차이를 확인할 수 있다.
const path = require("path");
const fs = require("fs");
const os = require("os");
const Module = require("module");

const frontend = path.resolve(process.argv[2]);
const outFile = process.argv[3];
const SP = __dirname;
const NM = process.env.NM || path.join(frontend, "node_modules");
const tsPath = path.join(NM, "typescript");
const ts = require(tsPath);
const { JSDOM } = require(path.join(NM, "jsdom"));

// 1) app 전체를 commonjs 로 변환
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "render-smoke-"));
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), r = path.join(rel, e.name);
    if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".next") continue; walk(p, r); continue; }
    if (!/\.(tsx?|css)$/.test(e.name) || e.name.endsWith(".d.ts")) continue;
    const dest = path.join(tmp, r);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (e.name.endsWith(".css")) { fs.writeFileSync(dest.replace(/\.css$/, ".css.js"), "module.exports={}"); continue; }
    const src = fs.readFileSync(p, "utf8");
    const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    fs.writeFileSync(dest.replace(/\.tsx?$/, ".js"), js);
  }
})(path.join(frontend, "app"), "app");

// 2) 모듈 해석: node_modules 는 frontend 에서, next/navigation 은 목
process.env.NODE_PATH = NM;
Module._initPaths();
const navMock = path.join(tmp, "next-navigation-mock.js");
const pushed = [];
fs.writeFileSync(navMock, `module.exports={useRouter:()=>({push:(u)=>global.__pushed.push(u),replace:()=>{},back:()=>{},prefetch:()=>{},refresh:()=>{}}),usePathname:()=>"/",useSearchParams:()=>new URLSearchParams(),useParams:()=>({})};`);
global.__pushed = pushed;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "next/navigation") return navMock;
  return origResolve.call(this, request, parent, ...rest);
};

// 3) jsdom 환경
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://cargo-ops-webapp-v2.vercel.app/", pretendToBeVisual: true });
const w = dom.window;
global.window = w; global.document = w.document; global.navigator = w.navigator;
for (const k of ["HTMLElement", "HTMLInputElement", "Node", "Event", "MouseEvent", "KeyboardEvent", "File", "FileReader", "Image", "URL", "URLSearchParams", "CustomEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "sessionStorage", "matchMedia"]) {
  try { if (w[k] !== undefined) global[k] = w[k]; } catch {}
}
global.IS_REACT_ACT_ENVIRONMENT = true;
w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
global.matchMedia = w.matchMedia;
w.scrollTo = () => {}; w.open = () => null;
global.Notification = w.Notification = { permission: "default", requestPermission: async () => "default" };

// 4) fetch 목 (URL 패턴별 고정 응답, 호출 기록)

// ===== Monthly Scheduled Flight 화면 시나리오 =====
const calls = [];
const posts = [];
const F = (flight, skdTime, dep, arr, extra = {}) => ({
  recordKey: `${skdTime.slice(0, 10)}|${flight}|${dep}|${arr}`, flightDate: skdTime.slice(0, 10), flight, departureCode: dep, arrivalCode: arr,
  skdTime, registrationNo: "HL7423", assigneeSlot: "", apiTime: "", apiRemark: "", apiGate: "", apiUpdatedAt: "", source: "excel", ...extra,
});
let DATA = {
  success: true,
  title: "Monthly Scheduled Flight('26.11.1~11.30)",
  window: { start: "2026-11-01", end: "2026-12-02", monthLast: "2026-11-30" },
  flights: [
    F("KJ248", "2026-11-06 07:10", "ICN", "ATL"),
    F("KJ911", "2026-11-06 09:00", "MXP", "ICN", { apiTime: "2026-11-06 09:40", apiRemark: "지연", apiGate: "623" }),
    F("KJ970", "2026-11-06 12:00", "HKG", "ICN"),
    F("KJ967", "2026-11-06 23:00", "ICN", "HKG"),
    F("KJ795", "2026-11-06 23:15", "ICN", "FRA"),
    F("KJ290", "2026-11-07 00:45", "ORD", "ICN"),
    F("KJ500", "2026-11-20 10:00", "ICN", "NRT"),
  ],
  assignees: [],
  apiRefreshedAt: "2026-11-06T08:55:00",
};
global.fetch = w.fetch = async (url, init) => {
  const u = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = (init && init.method) || "GET";
  calls.push(method + " " + u);
  const j = (o) => ({ ok: true, status: 200, json: async () => o });
  if (u.startsWith("/flights/monthly-schedule/assignees")) {
    const body = JSON.parse(init.body);
    DATA.assignees = [...DATA.assignees.filter((a) => !(a.flightDate === body.flightDate && a.shift === body.shift)), body];
    return j({ success: true, assignee: body });
  }
  if (u.startsWith("/flights/monthly-schedule/assignee-slot")) {
    const body = JSON.parse(init.body);
    DATA.flights = DATA.flights.map((f) => (f.recordKey === body.recordKey ? { ...f, assigneeSlot: body.slot } : f));
    return j({ success: true });
  }
  if (u.startsWith("/flights/monthly-schedule") && method === "POST") {
    posts.push(JSON.parse(init.body));
    return j({ success: true, saved: JSON.parse(init.body).records.length, removed: 0, invalid: 0, outsideWindow: 0, registrationSaved: 1, dates: [] });
  }
  if (u.startsWith("/flights/monthly-schedule")) return j(JSON.parse(JSON.stringify(DATA))); // 실제 fetch 처럼 매번 새 객체
  return j({ success: true });
};
// 시간 고정 (화면 문구 비교 안정화)
const RealDate = Date;
const base = new RealDate("2026-11-06T09:00:00+09:00").getTime();
const start = RealDate.now();
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(base); }
  static now() { return base; }
}
global.Date = FakeDate;

const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.map((x) => (x instanceof Error ? x.stack.split("\n")[0] : String(x))).join(" ").slice(0, 300)); };
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + (e && e.message)));
w.addEventListener("error", (e) => errors.push("window error: " + e.message));

const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setNativeValue(el, value) {
  const proto = el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}
async function runSteps(container, steps) {
  const log = [];
  let seen = calls.length;
  for (const [kind, arg, arg2] of steps) {
    let note = "";
    await act(async () => {
      if (kind === "click") {
        const btns = [...container.querySelectorAll("button")];
        const b = btns.find((x) => x.textContent.trim() === arg) || btns.find((x) => x.textContent.includes(arg));
        if (!b) { note = "버튼 없음"; return; }
        b.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
      } else if (kind === "type") {
        const el = container.querySelectorAll(arg)[arg2 && arg2.index || 0];
        if (!el) { note = "입력 없음"; return; }
        setNativeValue(el, arg2.value);
      }
    });
    for (let i = 0; i < 4; i++) await act(async () => { await sleep(120); });
    const text = container.textContent.replace(/\s+/g, " ").trim();
    log.push({ step: kind + ":" + arg + (kind === "type" ? "=" + arg2.value : ""), note, inputsNow: [...container.querySelectorAll("input,textarea,select")].map((i) => i.tagName.toLowerCase() + ":" + (i.getAttribute("type") || "") + ":" + (i.getAttribute("placeholder") || "")), textLength: text.length, text: text.slice(0, 1500), newCalls: calls.slice(seen).map((c) => c.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g, "<dt>")), errorsSoFar: [...new Set(errors)].length });
    seen = calls.length;
  }
  return log;
}

async function renderPage(name, file, setup, steps) {
  calls.length = 0; errors.length = 0; pushed.length = 0;
  w.localStorage.clear();
  if (setup) setup();
  const container = w.document.createElement("div");
  w.document.body.innerHTML = "";
  w.document.body.appendChild(container);
  const mod = require(path.join(tmp, file));
  const Page = mod.default;
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Page)); });
  for (let i = 0; i < 6; i++) await act(async () => { await sleep(150); });
  const stepLog = steps ? await runSteps(container, steps) : [];
  const text = container.textContent.replace(/\s+/g, " ").trim();
  const buttons = [...container.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  const inputs = [...container.querySelectorAll("input, textarea, select")].map((i) => `${i.tagName.toLowerCase()}:${i.type || ""}:${(i.value || "").slice(0, 30)}`);
  const result = {
    textLength: text.length, text: text.slice(0, 3000), buttons, inputs,
    fetchCalls: [...new Set(calls)].sort(), errors: [...new Set(errors)].sort(), pushed: [...pushed],
    localStorageKeys: Object.keys(w.localStorage).sort(), stepLog,
  };
  await act(async () => { root.unmount(); });
  return result;
}

w.confirm = global.confirm = () => true;
let pass = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log("OK  ", name); } else { console.log("FAIL", name, detail || ""); process.exitCode = 1; } };
const text = (c) => c.textContent.replace(/\s+/g, " ");
const rows = (c) => [...c.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => { const sel = td.querySelector("select"); return sel ? (sel.selectedOptions[0] || {}).textContent || "" : td.textContent.trim(); }));
const flightsShown = (c) => rows(c).map((r) => r[0]);
const settle = async () => { for (let i = 0; i < 6; i++) await act(async () => { await sleep(100); }); };
const clickText = async (c, label) => {
  await act(async () => {
    const b = [...c.querySelectorAll("button")].find((x) => x.textContent.includes(label));
    if (!b) throw new Error("버튼 없음: " + label);
    b.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  });
  await settle();
};
const setValue = async (el, value, eventName = "change") => {
  await act(async () => {
    const proto = el.tagName === "SELECT" ? w.HTMLSelectElement.prototype : el.tagName === "TEXTAREA" ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new w.Event("input", { bubbles: true }));
    el.dispatchEvent(new w.Event(eventName, { bubbles: true }));
  });
  await settle();
};

(async () => {
  const container = w.document.createElement("div");
  w.document.body.innerHTML = "";
  w.document.body.appendChild(container);
  const Page = require(path.join(tmp, "app/afocs-skd/page.js")).default;
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Page)); });
  await settle();

  check("제목 표시", text(container).includes("Monthly Scheduled Flight('26.11.1~11.30)"));
  check("열 때 서버에 API 갱신 요청(refresh=true)", calls.some((c) => c.includes("/flights/monthly-schedule?refresh=true")), calls);
  check("지금(09:00) 기준 A조·11/06 자동 선택", text(container).includes("Daily Job SKD (2026-11-06) · A조"), text(container).slice(0, 400));
  check("A조: 유형 1은 API 변경시각 순(KJ248 07:10, KJ911 09:40, KJ970 12:00)", JSON.stringify(flightsShown(container)) === JSON.stringify(["KJ248", "KJ911", "KJ970"]), flightsShown(container));
  const r911 = rows(container).find((r) => r[0] === "KJ911");
  check("유형 1: 변경시각·SKD·상태·주기장 표시", r911[4].includes("11-06 09:40") && r911[4].includes("SKD 09:00") && r911[4].includes("지연") && r911[7] === "623", r911);
  check("담당 기본 두 칸: A→B→A (이름 없으면 A·B 글자만)", rows(container).map((r) => r[5]).join(",") === "A,B,A", rows(container).map((r) => r[5]));
  const bg = [...container.querySelectorAll("tbody tr")].map((tr) => tr.style.background);
  check("인천 출발편은 노란색 줄", bg[0].includes("255, 245, 157") || bg[0].includes("#fff59d"), bg);

  await clickText(container, "C조");
  check("C조: 23:59까지 (23:00·23:15 편 포함)", JSON.stringify(flightsShown(container)) === JSON.stringify(["KJ967", "KJ795"]), flightsShown(container));
  await clickText(container, "S조");
  check("S조: 22:01부터 익일 06:30까지(23:00·23:15·익일 00:45)", JSON.stringify(flightsShown(container)) === JSON.stringify(["KJ967", "KJ795", "KJ290"]), flightsShown(container));
  check("조 버튼 범위 표시", text(container).includes("C조 14:01~23:59") && text(container).includes("S조 22:01~익일 06:30"), text(container).slice(0, 300));
  await clickText(container, "C조");

  const nameA = container.querySelector('input[aria-label="담당 A 이름"]');
  await setValue(nameA, "홍길동", "input");
  await act(async () => { nameA.dispatchEvent(new w.FocusEvent("blur", { bubbles: true })); nameA.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true })); });
  await settle();
  check("담당 A 이름 저장 후 'A(홍길동)' 표시, 이름 없는 B는 'B'", calls.some((c) => c.startsWith("POST /flights/monthly-schedule/assignees")) && rows(container)[0][5] === "A(홍길동)" && rows(container)[1][5] === "B", rows(container).map((r) => r[5]));

  const slotSelect = container.querySelector('select[aria-label="KJ795 담당"]');
  check("편별 담당 목록은 A·B 두 칸만(+자동)", [...slotSelect.options].map((o) => o.value).join(",") === ",A,B", [...slotSelect.options].map((o) => o.value));
  await setValue(slotSelect, "A");
  check("편별 담당 지정 저장", DATA.flights.find((f) => f.flight === "KJ795").assigneeSlot === "A" && rows(container)[1][5] === "A(홍길동)", rows(container).map((r) => r[5]));
  await setValue(container.querySelector('select[aria-label="KJ795 담당"]'), "");
  check("편별 지정 해제 → 자동 배정으로 복귀", DATA.flights.find((f) => f.flight === "KJ795").assigneeSlot === "", rows(container).map((r) => r[5]));

  const dateSelect = container.querySelector('select[aria-label="일자 선택"]');
  check("유형 1 일자: 오늘·내일·모레 3일", dateSelect.options.length === 3 && dateSelect.options[0].value === "2026-11-06", [...dateSelect.options].map((o) => o.value));
  await clickText(container, "유형 2");
  const dateSelect2 = container.querySelector('select[aria-label="일자 선택"]');
  check("유형 2 일자: 11/1 ~ 12/2 전체", dateSelect2.options.length === 32 && dateSelect2.options[31].value === "2026-12-02", dateSelect2.options.length);
  await clickText(container, "A조");
  const r911b = rows(container).find((r) => r[0] === "KJ911");
  check("유형 2: SKD 시각만, 주기장 비움", r911b[4] === "11-06 09:00" && r911b[7] === "", r911b);
  await setValue(dateSelect2, "2026-11-20");
  check("유형 2: 11/20 A조 KJ500", JSON.stringify(flightsShown(container)) === JSON.stringify(["KJ500"]), flightsShown(container));

  // 표 글자색·머리글 서식
  await clickText(container, "유형 1");
  await clickText(container, "C조");
  const td0 = container.querySelector("tbody td");
  const th0 = container.querySelector("thead th");
  check("표 안 글자는 검은색", td0.style.color === "rgb(0, 0, 0)" || td0.style.color === "#000000", td0.style.color);
  check("머리글: 굵게·가운데·회색 배경·검은 글자", th0.style.fontWeight === "900" && th0.style.textAlign === "center" && th0.style.color === "rgb(0, 0, 0)" && /212, 212, 216|#d4d4d8/i.test(th0.style.background), [th0.style.fontWeight, th0.style.textAlign, th0.style.color, th0.style.background]);

  // 담당 3칸 선택 (3편이 있는 S조에서 확인)
  await clickText(container, "S조");
  const nameInput = (slot) => container.querySelector('input[aria-label="담당 ' + slot + ' 이름"]');
  const slotsShown = () => rows(container).map((r) => r[5]);
  check("S조 3편 표시", rows(container).length === 3, slotsShown());
  check("기본: 이름 칸 A·B만, C 칸 없음", !!nameInput("A") && !!nameInput("B") && !nameInput("C"));
  check("기본: 이름이 없으면 A,B,A 글자만", slotsShown().join(",") === "A,B,A", slotsShown());
  await setValue(nameInput("A"), "홍길동", "input");
  check("A에 이름을 넣으면 A(홍길동), B는 그대로 B", slotsShown().join(",") === "A(홍길동),B,A(홍길동)", slotsShown());
  await setValue(nameInput("B"), "박종규", "input");
  check("B도 동일: B(박종규)", slotsShown().join(",") === "A(홍길동),B(박종규),A(홍길동)", slotsShown());
  await setValue(nameInput("A"), "", "input");
  check("A 이름을 지우면 A만 표시", slotsShown().join(",") === "A,B(박종규),A", slotsShown());
  const threeBox = container.querySelector('input[aria-label="담당 3칸(A·B·C) 표시"]');
  await act(async () => { threeBox.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); });
  await settle();
  check("3칸 선택하면 C 이름 칸이 생기고 A,B,C로 순환", !!nameInput("C") && slotsShown().join(",") === "A,B(박종규),C", slotsShown());
  await setValue(nameInput("C"), "김철수", "input");
  check("C도 동일: C(김철수)", slotsShown().join(",") === "A,B(박종규),C(김철수)", slotsShown());
  check("3칸 선택이 서버에 저장(slotCount=3)", DATA.assignees.some((a) => a.shift === "S" && a.slotCount === 3), DATA.assignees);
  const firstSelect = container.querySelector("tbody select");
  check("편별 담당 목록에도 A·B·C 표시", [...firstSelect.options].map((o) => o.value).join(",") === ",A,B,C", [...firstSelect.options].map((o) => o.value));
  await act(async () => { threeBox.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); });
  await settle();
  check("3칸 해제하면 다시 A·B 두 칸", !nameInput("C") && slotsShown().join(",") === "A,B(박종규),A", slotsShown());

  // 담당이 박종규이면 행 전체 굵게 + 굵은 노란 테두리 (S조 3편: A→B→A)
  await clickText(container, "S조");
  const nameIn = (slot) => container.querySelector('input[aria-label="담당 ' + slot + ' 이름"]');
  await setValue(nameIn("A"), "홍길동", "input");
  await setValue(nameIn("B"), "박종규", "input");
  const trs = () => [...container.querySelectorAll("tbody tr")];
  check("박종규(B) 담당 행만 강조(2번째 편)", trs().map((tr) => tr.getAttribute("data-highlight")).join(",") === ",1,", trs().map((tr) => tr.getAttribute("data-highlight")));
  const hiCells = [...trs()[1].querySelectorAll("td")];
  check("강조 행: 모든 칸 글자 굵게(900)", hiCells.every((td) => td.style.fontWeight === "900"), hiCells.map((td) => td.style.fontWeight));
  check("강조 행: 모든 칸의 아래쪽 테두리만 굵은 노란색",
    hiCells.every((td) => td.style.borderBottom.includes("4px") && /250, 204, 21|#facc15/i.test(td.style.borderBottom))
      && hiCells.every((td) => !td.style.borderTop.includes("4px") && !td.style.borderLeft.includes("4px") && !td.style.borderRight.includes("4px")),
    hiCells.map((td) => [td.style.borderTop, td.style.borderBottom, td.style.borderLeft, td.style.borderRight]));
  const normalCells = [...trs()[0].querySelectorAll("td")];
  check("다른 담당 행은 기본 서식", normalCells.every((td) => !td.style.borderTop.includes("4px")) && normalCells[0].style.fontWeight !== "900");
  await setValue(nameIn("B"), "박종규철", "input");
  check("이름이 다르면 강조 안 함", trs().every((tr) => !tr.getAttribute("data-highlight")));
  await setValue(nameIn("B"), "", "input");
  await setValue(nameIn("A"), "", "input");

  // 월간 SKD 입력(붙여넣기)
  await clickText(container, "월간 SKD 입력");
  const ta = container.querySelector("textarea");
  await setValue(ta, "편명\t등록기호\tDEP\tARR\tETD/ETA\nKJ0970\tHL7620\tHKG\tICN\t2026-11-08 19:35\nOZ123\tHL1\tICN\tNRT\t2026-11-08 10:00", "input");
  check("붙여넣기 미리보기: KJ 1편, 제외 1건", text(container).includes("읽은 편 1건") && text(container).includes("제외 1건"), text(container).slice(-500));
  await clickText(container, "1편 저장");
  check("저장 요청: 편명 정규화·일자 재업로드 모드", posts.length === 1 && posts[0].records[0].flight === "KJ970" && posts[0].replaceDates === true && posts[0].source === "paste", posts);
  check("저장 결과 안내(③·초기화면 반영)", text(container).includes("저장 완료") && text(container).includes("③ 등록번호/AFOCS"), text(container).slice(-300));

  await act(async () => { root.unmount(); });
  console.log("\n" + pass + "개 통과");
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log("FATAL", e && e.stack); process.exit(1); });
