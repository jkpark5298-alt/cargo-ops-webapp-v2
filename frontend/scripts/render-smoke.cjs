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
const calls = [];
const FIXED_NOW = "202610310020";
const fakeRows = [
  { flightId: "KJ247", flightNo: "KJ247", departureCode: "ATL", departureName: "애틀랜타", arrivalCode: "ICN", arrivalName: "인천공항", scheduleDateTime: "202610310020", estimatedDateTime: "202610310020", formattedScheduleTime: "2026/10/31 00:20", formattedEstimatedTime: "2026/10/31 00:20", gatenumber: "-", terminalid: "C01", remark: "", status: "", sourceType: "arrival", afocsSkd: "10. 31. 00:20" },
  { flightId: "KJ951", flightNo: "KJ951", departureCode: "ICN", departureName: "인천공항", arrivalCode: "HAN", arrivalName: "하노이", scheduleDateTime: "202610310045", estimatedDateTime: "202610310045", formattedScheduleTime: "2026/10/31 00:45", formattedEstimatedTime: "2026/10/31 00:45", gatenumber: "622", terminalid: "C01", remark: "", status: "", sourceType: "departure", hlnbr: "HL7420", registrationNo: "HL7420" },
];
const room = { id: "latest", name: "10.30 Schedule Flight", flightsInput: "KJ247, KJ951", startDateTime: "2026-10-30T21:00", endDateTime: "2026-10-31T12:00", fixed: true, lastFetchedAt: "2026. 11. 5. 오후 3:00:00", rows: fakeRows };
function respond(url, init) {
  const u = String(url);
  const method = (init && init.method) || "GET";
  const j = (o, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => o, text: async () => JSON.stringify(o) });
  if (/\/flights\/latest-schedule/.test(u)) return j({ success: true, room });
  if (/\/flights\/schedule-slots/.test(u)) return j({ success: true, active: { slot: "active", name: room.name, room, savedAt: "x" }, archive: null, linkedSlot: "active" });
  if (/\/flights\/aircraft-registrations/.test(u)) return j({ success: true, records: [{ date: "2026-10-31", flight: "KJ247", departureCode: "ATL", arrivalCode: "ICN", registrationNo: "HL8000", updatedAt: "2026-11-01T00:00:00" }] });
  if (/\/flights\/notification-history/.test(u)) return j({ success: true, items: [] });
  if (/\/flights\/incheon-api-usage/.test(u)) return j({ success: true, total: 4, departure: 1, arrival: 3, departureLimit: 100000, arrivalLimit: 100000, departureRate: 0, arrivalRate: 0, date: "2026-11-05" });
  if (/\/flights\/auto-push\/status/.test(u)) return j({ success: true, enabled: false, intervalMinutes: 30 });
  if (/\/flights\/push-public-key/.test(u)) return j({ success: false, publicKey: "" });
  if (/\/flights\/daily-report-text/.test(u)) return j({ success: true, report: null });
  if (/\/flights\/kj-all/.test(u) || /\/flights\/$/.test(u.split("?")[0]) || /\/flights\/?$/.test(u)) return j({ success: true, data: fakeRows, count: 2 });
  if (/\/flights\/check-schedule/.test(u)) return j({ success: true, changed: false, changedItems: [], checkedCount: 2, room });
  if (/\/weather/.test(u)) return j({ success: true, temperature: 12, current: { temp: 12 }, hourly: [] });
  if (/\/notion\/daily-records/.test(u)) return j({ success: true, found: false, count: 0, pageId: null, url: null });
  if (/\/notion\//.test(u)) return j({ success: true });
  return j({ success: true });
}
global.fetch = w.fetch = async (url, init) => {
  const u = String(url).replace(/^https?:\/\/[^/]+/, "");
  calls.push(`${(init && init.method) || "GET"} ${u.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g, "<dt>")}`);
  return respond(url, init);
};

// 시간 고정 (화면 문구 비교 안정화)
const RealDate = Date;
const base = new RealDate("2026-10-31T00:10:00+09:00").getTime();
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

(async () => {
  const results = {};
  const seedRooms = () => w.localStorage.setItem("cargo_ops_monitor_rooms_v6", JSON.stringify([room]));
  const HOME = [["click", "API 즉시 확인"], ["click", "변경 즉시 확인"], ["click", "자동 상태 새로고침"], ["click", "알림 이력 보기"], ["click", "S"], ["click", "A"], ["click", "특이사항 있음"], ["type", "textarea", { value: "테스트 메모" }], ["click", "일일 업무 임시 저장"], ["click", "텍스트 공유 저장"], ["click", "Notion 일일 기록 저장"], ["click", "알림 허용"], ["click", "테스트 알림"], ["click", "편 삭제"], ["click", "앱 화면만 초기화"]];
  const FLIGHTS = [["click", "③ 등록번호 / AFOCS"], ["click", "① 편명 조회 및 저장"], ["click", "편명 직접 조회"], ["type", "input:not([type=file]):not([type=date]), textarea", { value: "247, 951" }], ["click", "편명 조회"], ["click", "KJ 전체 조회"], ["click", "② 편명 수정"], ["click", "③ 등록번호 / AFOCS"], ["click", "편명 직접 조회"], ["type", "input:not([type=file]):not([type=date]), textarea", { value: "247, 951" }], ["click", "편명 조회"], ["click", "등록기호 저장"], ["click", "초기화면"]];
  const FIXED = [["click", "A"], ["click", "S"], ["click", "🔴 특이사항 있음"], ["type", "textarea", { value: "메모 입력" }], ["click", "💾 Supabase에 저장 및 동기화"], ["click", "다시 조회"], ["click", "🔄 갱신"], ["click", "편명조회로"]];
  results.home = await renderPage("home", "app/page.js", seedRooms, HOME);
  results.flights = await renderPage("flights", "app/flights/page.js", seedRooms, FLIGHTS);
  results.afocsSkd = await renderPage("afocs-skd", "app/afocs-skd/page.js", seedRooms, FIXED);
  // 편명조회 모드 전환 동작 (탭 클릭) 도 확인
  fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
  const summary = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { 글자수: v.textLength, 버튼: v.buttons.length, 입력: v.inputs.length, fetch: v.fetchCalls.length, 오류: v.errors.length }]));
  console.log = (...a) => process.stdout.write(a.join(" ") + "\n");
  console.log(JSON.stringify(summary, null, 1));
  if (Object.values(results).some((r) => r.errors.length)) { for (const [k, v] of Object.entries(results)) if (v.errors.length) console.log(k, "오류:", v.errors); }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => { process.stdout.write("FATAL " + (e.stack || e) + "\n"); process.exit(1); });
