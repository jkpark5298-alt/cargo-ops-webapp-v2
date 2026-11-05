// 홈 화면 Schedule Flight 편 삭제(서버 삭제 API·실패 시 되돌리기) jsdom 시나리오 테스트
// 사용 (frontend 폴더에서): node scripts/schedule-delete-ui-test.cjs .
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

// ===== 홈 화면 편 삭제 시나리오 =====
const calls = [];
const FL = ["KJ970", "KJ987", "KJ971"];
const mkRow = (f, dep, arr, t) => ({ flightId: f, flightNo: f, departureCode: dep, arrivalCode: arr, scheduleDateTime: t, estimatedDateTime: t, formattedScheduleTime: t.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1/$2/$3 $4:$5"), formattedEstimatedTime: t.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1/$2/$3 $4:$5"), gatenumber: "621", remark: "", sourceType: dep === "ICN" ? "departure" : "arrival", registrationNo: "HL7000", afocsSkd: "11. 06. 19:35" });
const ROWS = [mkRow("KJ970", "HKG", "ICN", "202611061935"), mkRow("KJ987", "ICN", "PVG", "202611062025"), mkRow("KJ971", "ICN", "HKG", "202611062250")];
const mkRoom = (flights) => ({ id: "latest", name: "2026.11.06 Schedule Flight", flightsInput: flights.join(", "), fixed: true, startDateTime: "2026-11-06T13:00", endDateTime: "2026-11-06T23:59", lastFetchedAt: "2026-11-06T09:00:00+09:00", rows: ROWS.filter((r) => flights.includes(r.flightNo)).map((r) => ({ ...r })) });
let server = mkRoom(FL);
let deleteMode = "ok"; // ok | fail
global.fetch = w.fetch = async (url, init) => {
  const u = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = (init && init.method) || "GET";
  calls.push(method + " " + u);
  const j = (o, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => o, text: async () => JSON.stringify(o) });
  let m;
  if (method === "DELETE" && (m = u.match(/\/flights\/schedule-flights\/([^/?]+)/))) {
    if (deleteMode === "fail") return j({ success: false, detail: "서버 오류" }, false);
    const f = decodeURIComponent(m[1]);
    server = mkRoom(server.flightsInput.split(", ").filter((x) => x && x !== f));
    return j({ success: true, removed: true, room: server });
  }
  if (/\/flights\/latest-schedule/.test(u)) { if (method === "POST") { return j({ success: true, room: JSON.parse(init.body).room }); } return j({ success: true, room: server }); }
  if (/\/flights\/schedule-slots/.test(u)) return j({ success: true, active: { slot: "active", name: server.name, room: server, savedAt: "x" }, archive: null, linkedSlot: "active", rotated: false });
  if (/aircraft-registrations/.test(u)) return j({ success: true, records: [] });
  if (/notion\/daily-records\?date=/.test(u)) return j({ success: true, found: false });
  if (/daily-report-text/.test(u)) return j({ success: true, report: null });
  if (/\/flights\/?$/.test(u) && method === "POST") return j({ success: true, data: ROWS.filter((r) => JSON.parse(init.body).flights.includes(r.flightNo)), count: 1 });
  return j({ success: true, items: [], data: [], count: 0 });
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
w.alert = () => {};
let pass = 0;
const check = (name, ok, detail) => { if (ok) { pass++; console.log("OK  ", name); } else { console.log("FAIL", name, detail || ""); process.exitCode = 1; } };
const text = (c) => c.textContent.replace(/\s+/g, " ");
const clickNth = async (c, label, nth) => {
  await act(async () => {
    const bs = [...c.querySelectorAll("button")].filter((x) => x.textContent.trim() === label);
    const b = bs[nth || 0];
    if (b) b.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
    else console.log("   (버튼 없음: " + label + ")");
  });
  for (let i = 0; i < 5; i++) await act(async () => { await sleep(150); });
};
async function open() {
  calls.length = 0;
  w.localStorage.clear();
  w.localStorage.setItem("cargo_ops_monitor_rooms_v6", JSON.stringify([mkRoom(FL)]));
  const container = w.document.createElement("div");
  w.document.body.innerHTML = ""; w.document.body.appendChild(container);
  const Page = require(path.join(tmp, "app/page.js")).default;
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Page)); });
  for (let i = 0; i < 10; i++) await act(async () => { await sleep(150); });
  return { container, root };
}
const storedFlights = () => { try { return JSON.parse(w.localStorage.getItem("cargo_ops_monitor_rooms_v6")).find((r) => r.fixed).flightsInput; } catch { return "?"; } };

(async () => {
  // 1) 정상 삭제: 서버 삭제 API 1회만 호출, 화면·로컬에서 사라짐
  server = mkRoom(FL); deleteMode = "ok";
  let r = await open();
  check("준비: 3편이 화면에 표시", ["KJ970", "KJ987", "KJ971"].every((f) => text(r.container).includes(f)));
  const before = calls.length;
  await clickNth(r.container, "편 삭제", 1); // KJ987
  await clickNth(r.container, "삭제 확인", 0);
  const delCalls = calls.slice(before).filter((c) => c.startsWith("DELETE "));
  check("서버 삭제 API가 KJ987 로 1번 호출됨", delCalls.length === 1 && /schedule-flights\/KJ987/.test(delCalls[0]), delCalls);
  check("삭제 시 전체 방 덮어쓰기(POST latest-schedule / slots/save) 호출 없음", !calls.slice(before).some((c) => /POST .*latest-schedule|POST .*schedule-slots\/save/.test(c)), calls.slice(before));
  check("화면에서 KJ987 카드가 사라지고 2편만 남음", [...r.container.querySelectorAll("button")].filter((x) => x.textContent.trim() === "편 삭제").length === 2 && text(r.container).includes("삭제 완료"), [...r.container.querySelectorAll("button")].filter((x) => x.textContent.trim() === "편 삭제").length);
  check("이 기기 저장소에서도 삭제", !storedFlights().includes("KJ987"), storedFlights());
  await act(async () => { r.root.unmount(); });

  // 2) 서버 삭제 실패 → 화면을 원래대로 되돌리고 안내
  server = mkRoom(FL); deleteMode = "fail";
  r = await open();
  await clickNth(r.container, "편 삭제", 1);
  await clickNth(r.container, "삭제 확인", 0);
  check("서버 실패 시 편이 화면에 그대로 남음", text(r.container).includes("KJ987"), text(r.container).slice(0, 200));
  check("서버 실패 시 이 기기 저장소도 원래대로", storedFlights().includes("KJ987"), storedFlights());
  check("삭제하지 못했다는 안내가 보임", text(r.container).includes("삭제하지 못했습니다"));
  await act(async () => { r.root.unmount(); });

  console.log("\n" + pass + "개 통과");
  process.exit(process.exitCode || 0);
})();
