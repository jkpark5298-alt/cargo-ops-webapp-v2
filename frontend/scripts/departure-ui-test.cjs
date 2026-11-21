// 초기화면 카드 인천 도착편 출발 일시(자동 저장)·등록번호 수정 jsdom 시나리오 테스트
// 사용 (frontend 폴더에서): node scripts/departure-ui-test.cjs .
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

// ===== 초기화면 카드: 인천 도착편 출발 일시(자동 저장) · 등록번호 수정 시나리오 =====
const calls = [];
const posts = { dep: [], reg: [] };
const mkRow = (f, dep, arr, t, hl) => ({ flightId: f, flightNo: f, departureCode: dep, arrivalCode: arr, scheduleDateTime: t, estimatedDateTime: t, formattedScheduleTime: t.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1/$2/$3 $4:$5"), formattedEstimatedTime: t.replace(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/, "$1/$2/$3 $4:$5"), gatenumber: "621", remark: "", sourceType: dep === "ICN" ? "departure" : "arrival", registrationNo: hl, hlnbr: hl, afocsSkd: "11. 06. 19:20" });
const ROWS = [mkRow("KJ918", "TAO", "ICN", "202611061920", "HL8319"), mkRow("KJ387", "ICN", "HAN", "202611062030", "HL7507")];
const mkRoom = () => ({ id: "latest", name: "2026.11.06 Schedule Flight", flightsInput: "KJ918, KJ387", fixed: true, startDateTime: "2026-11-06T13:00", endDateTime: "2026-11-06T23:59", lastFetchedAt: "2026-11-06T09:00:00+09:00", rows: ROWS.map((r) => ({ ...r })) });
let server = mkRoom();
let deps = {};
let failDeparture = false;
let failRegistration = false;
global.fetch = w.fetch = async (url, init) => {
  const u = String(url).replace(/^https?:\/\/[^/]+/, "");
  const method = (init && init.method) || "GET";
  calls.push(method + " " + u);
  const j = (o, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => o, text: async () => JSON.stringify(o) });
  if (/\/flights\/departure-times/.test(u)) {
    if (method === "POST") {
      const body = JSON.parse(init.body);
      posts.dep.push(body);
      if (failDeparture) return j({ success: false, detail: "서버 저장 오류" }, false);
      const key = body.date + "|" + body.flight;
      if (body.departure) deps[key] = { departure: body.departure, updatedAt: "x" }; else delete deps[key];
    }
    return j({ success: true, items: deps });
  }
  if (/\/flights\/aircraft-registrations/.test(u)) {
    if (method === "POST") {
      const body = JSON.parse(init.body);
      posts.reg.push(body);
      if (failRegistration) return j({ success: false, detail: "등록 기록 서버 오류" }, false);
      return j({ success: true, records: body.records });
    }
    return j({ success: true, records: [] });
  }
  if (/\/flights\/latest-schedule/.test(u)) { if (method === "POST") return j({ success: true, room: JSON.parse(init.body).room }); return j({ success: true, room: server }); }
  if (/\/flights\/schedule-slots/.test(u)) return j({ success: true, active: { slot: "active", name: server.name, room: server, savedAt: "x" }, archive: null, linkedSlot: "active", rotated: false });
  if (/notion\/daily-records\?date=/.test(u)) return j({ success: true, found: false });
  if (/daily-report-text/.test(u)) return j({ success: true, report: null });
  return j({ success: true, items: [], data: [], count: 0 });
};
const RealDate = Date;
const base = new RealDate("2026-11-06T09:00:00+09:00").getTime();
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(base); }
  static now() { return base; }
}
global.Date = FakeDate;
const errors = [];
console.error = (...a) => { errors.push(a.map((x) => (x instanceof Error ? x.stack.split("\n")[0] : String(x))).join(" ").slice(0, 300)); };
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + (e && e.message)));

const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log("OK  ", name); } else { console.log("FAIL", name, detail === undefined ? "" : JSON.stringify(detail)); process.exitCode = 1; }
};
const settle = async (n = 5) => { for (let i = 0; i < n; i++) await act(async () => { await sleep(120); }); };
function setNativeValue(el, value) {
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value").set.call(el, value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const q = (c, label) => c.querySelector('input[aria-label="' + label + '"]');
const typeInto = async (el, value, commit = true) => {
  await act(async () => {
    setNativeValue(el, value);
    if (commit) el.dispatchEvent(new w.FocusEvent("focusout", { bubbles: true }));
  });
  await settle(4);
};
const btn = (c, label, scope) => [...(scope || c).querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const click = async (b) => { await act(async () => { b.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true })); }); await settle(5); };
const cardOf = (c, flight, other) =>
  [...c.querySelectorAll("div")]
    .filter((d) => d.textContent.includes(flight) && d.textContent.includes("등록 번호") && !d.textContent.includes(other))
    .sort((a, b) => a.textContent.length - b.textContent.length)[0];

async function open() {
  calls.length = 0;
  w.localStorage.clear();
  const container = w.document.createElement("div");
  w.document.body.innerHTML = ""; w.document.body.appendChild(container);
  const Page = require(path.join(tmp, "app/page.js")).default;
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(Page)); });
  await settle(10);
  return { container, root };
}

(async () => {
  let { container: c, root } = await open();

  // 1) 인천 도착편(KJ918): 출발 입력칸, 예정 도착일(11.06)로 미리 채움 / 인천 출발편(KJ387): 없음
  const dDate = () => q(c, "KJ918 출발 월일");
  const dTime = () => q(c, "KJ918 출발 시간");
  check("인천 도착편에 출발 월일·시각 입력칸", !!dDate() && !!dTime(), [...c.querySelectorAll("input")].map((i) => i.getAttribute("aria-label")));
  check("출발 월일은 예정 도착일(11.06)로 미리 채워지고 시각은 비어 있음", dDate() && dDate().value === "11.06" && dTime().value === "", [dDate() && dDate().value, dTime() && dTime().value]);
  check("인천 출발편(KJ387)에는 출발 입력칸이 없음", !q(c, "KJ387 출발 월일") && !q(c, "KJ387 출발 시간"));
  check("인천 도착편은 노선이 아래 줄로 내려가 표시", cardOf(c, "KJ918", "KJ387").textContent.includes("TAO → ICN"));

  // 2) 자동 저장: 시각만 입력해도 월일이 채워져 있으면 저장
  await typeInto(dTime(), "14:10");
  check("월일+시각이 채워지면 자동 저장(일자·편명·출발 일시)", posts.dep.length === 1 && posts.dep[0].date === "2026-11-06" && posts.dep[0].flight === "KJ918" && posts.dep[0].departure === "2026-11-06 14:10", posts.dep);
  check("입력값이 화면에 유지", dTime().value === "14:10");

  // 3) 같은 값으로 다시 포커스를 벗어나도 다시 저장하지 않음
  const nPosts = posts.dep.length;
  await typeInto(dTime(), "14:10");
  check("값이 같으면 다시 저장하지 않음", posts.dep.length === nPosts, posts.dep.length);

  // 4) 다시 열면(다른 기기·새로고침) 서버 값이 표시
  await act(async () => { root.unmount(); });
  ({ container: c, root } = await open());
  check("다시 열면 저장된 출발 시각이 표시", q(c, "KJ918 출발 시간") && q(c, "KJ918 출발 시간").value === "14:10" && q(c, "KJ918 출발 월일").value === "11.06", [q(c, "KJ918 출발 시간") && q(c, "KJ918 출발 시간").value]);

  // 5) 시각만 지우면(월일은 남음) 저장하지 않음 → 둘 다 비우면 삭제
  const before = posts.dep.length;
  await typeInto(q(c, "KJ918 출발 시간"), "");
  check("한쪽만 비우면 저장하지 않음", posts.dep.length === before, posts.dep.length);
  await typeInto(q(c, "KJ918 출발 월일"), "");
  check("월일·시각을 모두 비우면 서버 값 삭제", posts.dep.length === before + 1 && posts.dep[before].departure === "", posts.dep.slice(before));

  // 6) 잘못된 값은 안내하고 저장하지 않음
  const before2 = posts.dep.length;
  await typeInto(q(c, "KJ918 출발 월일"), "11.06", false);
  await typeInto(q(c, "KJ918 출발 시간"), "99:99");
  check("잘못된 시각은 안내 문구, 저장 안 함", cardOf(c, "KJ918", "KJ387").textContent.includes("출발 시각을 확인하세요") && posts.dep.length === before2, cardOf(c, "KJ918", "KJ387").textContent.slice(0, 200));

  // 7) 서버 저장 실패: 오류 안내 + 값 되돌림
  failDeparture = true;
  await typeInto(q(c, "KJ918 출발 시간"), "13:00");
  check("저장 실패 시 오류 문구 표시", cardOf(c, "KJ918", "KJ387").textContent.includes("서버 저장 오류"), cardOf(c, "KJ918", "KJ387").textContent.slice(0, 200));
  failDeparture = false;

  // 8) 등록번호: 평소 읽기 전용(HL8319), 수정 버튼으로만 입력
  const card918 = () => cardOf(c, "KJ918", "KJ387");
  check("등록번호는 평소 읽기 전용 글자(입력칸 없음)", card918().textContent.includes("HL8319") && !q(c, "KJ918 등록 번호 수정") && !!btn(c, "수정", card918()));
  await click(btn(c, "수정", card918()));
  check("수정 버튼을 누르면 입력칸이 열리고 현재 값이 들어 있음", q(c, "KJ918 등록 번호 수정") && q(c, "KJ918 등록 번호 수정").value === "HL8319");
  await typeInto(q(c, "KJ918 등록 번호 수정"), "12", false);
  await click(btn(c, "저장", card918()));
  check("형식 오류는 안내하고 저장하지 않음", card918().textContent.includes("HL + 숫자 4~5자리") && posts.reg.length === 0, posts.reg);
  await typeInto(q(c, "KJ918 등록 번호 수정"), "8320", false);
  await click(btn(c, "저장", card918()));
  check("숫자만 써도 HL8320 으로 등록 기록 저장(일자·편명·노선 포함)", posts.reg.length === 1 && posts.reg[0].records[0].registrationNo === "HL8320" && posts.reg[0].records[0].date === "2026-11-06" && posts.reg[0].records[0].flight === "KJ918" && posts.reg[0].records[0].departureCode === "TAO" && posts.reg[0].records[0].arrivalCode === "ICN", posts.reg);
  check("저장 후 카드에 HL8320 과 '수정됨' 표시, 입력칸은 닫힘", card918().textContent.includes("HL8320") && card918().textContent.includes("수정됨") && !q(c, "KJ918 등록 번호 수정"), card918().textContent.slice(0, 200));
  check("다른 편(KJ387)의 등록번호는 그대로", cardOf(c, "KJ387", "KJ918").textContent.includes("HL7507"));

  // 9) 등록번호 저장 실패: 오류 안내, 값은 그대로
  failRegistration = true;
  await click(btn(c, "수정", card918()));
  await typeInto(q(c, "KJ918 등록 번호 수정"), "HL9999", false);
  await click(btn(c, "저장", card918()));
  check("서버 저장 실패 시 오류 문구가 보이고 입력칸은 열려 있음", card918().textContent.includes("등록 기록 서버 오류") && !!q(c, "KJ918 등록 번호 수정"), card918().textContent.slice(0, 220));
  await click(btn(c, "취소", card918()));
  check("취소하면 입력칸이 닫히고 읽기 전용으로 복귀, 값은 HL8320 그대로", !q(c, "KJ918 등록 번호 수정") && !!btn(c, "수정", card918()) && card918().textContent.includes("HL8320") && !card918().textContent.includes("HL9999"));
  failRegistration = false;

  check("실행 중 콘솔 오류 없음", errors.length === 0, [...new Set(errors)].slice(0, 3));
  console.log("\n" + pass + "개 통과");
  await act(async () => { root.unmount(); });
  process.exit(process.exitCode || 0);
})();
