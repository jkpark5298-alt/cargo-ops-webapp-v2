// 일일 보고·특이사항 임시저장(날짜 변경, 새 특이사항 작성) jsdom 시나리오 테스트
// 사용 (frontend 폴더에서): node scripts/daily-rollover-test.cjs .
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

// ===== 일일 보고/특이사항 임시저장 시나리오 =====
const calls = [];
global.fetch = w.fetch = async (url, init) => {
  const u = String(url).replace(/^https?:\/\/[^/]+/, "");
  calls.push(((init && init.method) || "GET") + " " + u);
  const j = (o) => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
  if (/notion\/daily-records\?date=/.test(u)) return j({ found: false });
  if (/daily-report-text/.test(u)) return j({ success: true, report: null });
  if (/latest-schedule|schedule-slots/.test(u)) return j({ success: true, room: null, active: null, archive: null, linkedSlot: "active" });
  if (/aircraft-registrations/.test(u)) return j({ success: true, records: [] });
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

const KEYS = { img: "cargo_ops_home_images_v1", note: "cargo_ops_home_note_v1", daily: "cargo_ops_daily_draft_v1", issue: "cargo_ops_issue_draft_v1", issueRec: "cargo_ops_issue_notion_record_v1", dailyRecs: "cargo_ops_daily_notion_records_by_date_v1" };
let confirmAnswer = true;
const confirms = [];
w.confirm = global.confirm = (m) => { confirms.push(m); return confirmAnswer; };
w.alert = () => {};
let pass = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("OK  ", name); }
  else { console.log("FAIL", name, detail || ""); process.exitCode = 1; }
};
const img = (type) => ({ id: type + "1", type, label: type, savedAt: "x", dataUrl: "data:image/png;base64,AA", memo: "" });

async function open(setup) {
  calls.length = 0; confirms.length = 0;
  w.localStorage.clear(); setup();
  const container = w.document.createElement("div");
  w.document.body.innerHTML = ""; w.document.body.appendChild(container);
  const Page = require(path.join(tmp, "app/page.js")).default;
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Page)); });
  for (let i = 0; i < 8; i++) await act(async () => { await sleep(150); });
  return { container, root };
}
const ta = (c) => [...c.querySelectorAll("textarea")];
const btns = (c) => [...c.querySelectorAll("button")].map((b) => b.textContent.trim());
const click = async (c, label) => {
  await act(async () => {
    const b = [...c.querySelectorAll("button")].find((x) => x.textContent.includes(label));
    if (b) b.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
    else console.log("   (버튼 없음: " + label + ")");
  });
  for (let i = 0; i < 4; i++) await act(async () => { await sleep(120); });
};
const dailyDraft = (workDate, note, status) => JSON.stringify({ note, status: status || "normal", author: "jkpark", workDate, savedAt: "2026-11-05T10:00:00.000Z" });
const stored = (k) => { try { return JSON.parse(w.localStorage.getItem(k)); } catch { return null; } };

(async () => {
  // 1) 어제 날짜 임시저장(Notion 미저장) + 사진·메모 → 확인 창, 확인하면 오늘 새로 시작
  confirmAnswer = true;
  let r = await open(() => {
    w.localStorage.setItem(KEYS.daily, dailyDraft("2026-11-05", "어제 메모"));
    w.localStorage.setItem(KEYS.note, "어제 메모");
    w.localStorage.setItem(KEYS.img, JSON.stringify([img("schedule")]));
  });
  check("어제 미저장 내용이 있으면 확인 창을 띄움", confirms.length === 1 && /2026-11-05/.test(confirms[0]), confirms);
  check("확인하면 메모가 비워짐", !ta(r.container).some((t) => t.value.includes("어제 메모")));
  check("저장소의 일일 임시저장이 오늘 날짜·빈 메모로 바뀜", stored(KEYS.daily).workDate === "2026-11-06" && stored(KEYS.daily).note === "", stored(KEYS.daily));
  check("사진도 비워짐", (stored(KEYS.img) || []).length === 0, stored(KEYS.img));
  await act(async () => { r.root.unmount(); });

  // 2) 취소 → 이전 날짜 내용 유지
  confirmAnswer = false;
  r = await open(() => {
    w.localStorage.setItem(KEYS.daily, dailyDraft("2026-11-05", "어제 메모"));
    w.localStorage.setItem(KEYS.note, "어제 메모");
  });
  check("취소하면 어제 내용 그대로 유지", ta(r.container).some((t) => t.value === "어제 메모") && stored(KEYS.daily).workDate === "2026-11-05", stored(KEYS.daily));
  await act(async () => { r.root.unmount(); });

  // 3) 어제 날짜지만 이미 Notion 저장됨 → 확인 없이 새로 시작
  confirmAnswer = true;
  r = await open(() => {
    w.localStorage.setItem(KEYS.daily, dailyDraft("2026-11-05", "저장한 메모"));
    w.localStorage.setItem(KEYS.note, "저장한 메모");
    w.localStorage.setItem(KEYS.dailyRecs, JSON.stringify({ "2026-11-05": { pageId: "p1", savedAt: "2026. 11. 5. 오후 6:00:00", workDate: "2026-11-05" } }));
  });
  check("Notion 저장 완료된 지난 날짜는 확인 없이 새로 시작", confirms.length === 0 && !ta(r.container).some((t) => t.value.includes("저장한 메모")), confirms);
  await act(async () => { r.root.unmount(); });

  // 4) 오늘 날짜 임시저장은 유지
  r = await open(() => {
    w.localStorage.setItem(KEYS.daily, dailyDraft("2026-11-06", "오늘 메모"));
    w.localStorage.setItem(KEYS.note, "오늘 메모");
  });
  check("오늘 날짜 내용은 유지(확인 창 없음)", confirms.length === 0 && ta(r.container).some((t) => t.value === "오늘 메모"));
  await act(async () => { r.root.unmount(); });

  // 5) 어제 저장한 특이사항 → 오늘 열면 비워짐
  r = await open(() => {
    w.localStorage.setItem(KEYS.issue, JSON.stringify({ flight: "KJ283", route: "ICN→NRT", hlnbr: "HL8001", text: "어제 특이사항", status: "issue", author: "jkpark" }));
    w.localStorage.setItem(KEYS.issueRec, JSON.stringify({ pageId: "i1", savedAt: "2026. 11. 5. 오후 6:00:00" }));
    w.localStorage.setItem(KEYS.daily, dailyDraft("2026-11-06", "", "issue"));
  });
  check("지난 날 저장한 특이사항은 오늘 열 때 비워짐", !w.localStorage.getItem(KEYS.issueRec) && !ta(r.container).some((t) => t.value.includes("어제 특이사항")));
  await act(async () => { r.root.unmount(); });

  // 6) 오늘 저장한 특이사항: 새 특이사항 작성
  r = await open(() => {
    w.localStorage.setItem(KEYS.issue, JSON.stringify({ flight: "KJ283", route: "ICN→NRT", hlnbr: "HL8001", text: "오늘 특이사항", status: "issue", author: "jkpark" }));
    w.localStorage.setItem(KEYS.issueRec, JSON.stringify({ pageId: "i2", savedAt: "2026. 11. 6. 오전 8:00:00", workDate: "2026-11-06" }));
    w.localStorage.setItem(KEYS.daily, dailyDraft("2026-11-06", "오늘 일일 메모", "issue"));
    w.localStorage.setItem(KEYS.note, "오늘 일일 메모");
  });
  check("저장 후 상태: '새 특이사항 작성' 버튼이 보임", btns(r.container).some((b) => b.includes("새 특이사항 작성")), btns(r.container).join(" | "));
  await click(r.container, "새 특이사항 작성");
  check("새 특이사항 작성: 특이사항 입력칸이 비워짐", !ta(r.container).some((t) => t.value.includes("오늘 특이사항")));
  check("새 특이사항 작성: Notion 연결이 해제됨", !w.localStorage.getItem(KEYS.issueRec) && !btns(r.container).some((b) => b.includes("새 특이사항 작성")) && btns(r.container).some((b) => b === "Notion 특이사항 저장"), btns(r.container).join(" | "));
  check("새 특이사항 작성: 일일 메모는 그대로", ta(r.container).some((t) => t.value === "오늘 일일 메모"));
  await act(async () => { r.root.unmount(); });

  // 7) 일일 임시저장이 '이상 없음'이면 열 때 상태가 바뀌지 않음
  r = await open(() => {
    w.localStorage.setItem(KEYS.issue, JSON.stringify({ flight: "KJ1", route: "", hlnbr: "", text: "미저장 특이사항", status: "issue", author: "jkpark" }));
    w.localStorage.setItem(KEYS.daily, dailyDraft("2026-11-06", "", "normal"));
  });
  check("열 때 상태가 '특이사항 있음'으로 강제 전환되지 않음", stored(KEYS.daily).status === "normal", stored(KEYS.daily));
  await act(async () => { r.root.unmount(); });

  console.log("\n" + pass + "개 통과");
  process.exit(process.exitCode || 0);
})();
