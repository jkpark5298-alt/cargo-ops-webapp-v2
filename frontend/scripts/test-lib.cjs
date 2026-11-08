// 공용 lib(편명 정규화 · 등록번호 우선순위 · 스케줄 저장소) 단위 테스트
// 실행: cd frontend && node scripts/test-lib.cjs
const ts = require("typescript");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
// 변환한 모듈이 xlsx 등 프로젝트 패키지를 찾을 수 있게 함
process.env.NODE_PATH = path.join(__dirname, "..", "node_modules");
require("module")._initPaths();

const appDir = path.join(__dirname, "..", "app");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cargo-lib-test-"));
const compile = (rel) => {
  const src = fs.readFileSync(path.join(appDir, rel + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2020" } }).outputText;
  const dest = path.join(outDir, "app", rel + ".js");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, js);
};
["lib/flight-types", "lib/flight-keys", "lib/flight-status", "lib/aircraft-registration", "lib/schedule-store", "lib/api-config", "lib/afocs-skd", "lib/csm-checklist", "lib/monthly-schedule", "lib/flight-status", "lib/flight-alerts", "home/helpers", "home/constants", "home/types",
  "flights/lib/helpers", "flights/lib/types", "flights/lib/constants"].forEach(compile);

// 브라우저 환경 흉내
const store = {};
const mockStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = { localStorage: mockStorage };
global.localStorage = mockStorage;

const keys = require(path.join(outDir, "app/lib/flight-keys.js"));
const reg = require(path.join(outDir, "app/lib/aircraft-registration.js"));
const helpers = require(path.join(outDir, "app/flights/lib/helpers.js"));
const sched = require(path.join(outDir, "app/lib/schedule-store.js"));

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("OK   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}
async function atest(name, fn) {
  try { await fn(); passed++; console.log("OK   " + name); }
  catch (e) { console.log("FAIL " + name + "\n     " + e.message); process.exitCode = 1; }
}

const rec = (date, flight, dep, arr, no, updatedAt) => ({ date, flight, departureCode: dep, arrivalCode: arr, registrationNo: no, updatedAt });
const row = (flight, dep, arr, sched, est, extra = {}) => ({
  flightId: flight, flightNo: flight, departureCode: dep, arrivalCode: arr,
  scheduleDateTime: sched, estimatedDateTime: est || sched,
  formattedScheduleTime: sched.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/, "$1/$2/$3 $4:$5"),
  ...extra,
});

/* ───────── 편명·등록번호 정규화 ───────── */
test("normalizeFlightKey: 숫자만/소문자/공백/하이픈/앞자리 0", () => {
  assert.strictEqual(keys.normalizeFlightKey("247"), "KJ247");
  assert.strictEqual(keys.normalizeFlightKey("kj 0247"), "KJ247");
  assert.strictEqual(keys.normalizeFlightKey("KJ-972"), "KJ972");
  assert.strictEqual(keys.normalizeFlightKey("0"), "KJ0");
  assert.strictEqual(keys.normalizeFlightKey(""), "");
});
test("normalizeFlightsInput: 쉼표·공백·줄바꿈, 3~4자리 숫자는 KJ 부착", () => {
  assert.deepStrictEqual(keys.normalizeFlightsInput("247, 972\nKJ283  kj920"), ["KJ247", "KJ972", "KJ283", "KJ920"]);
});
test("normalizeHlNumber / confirmedRegistrationNo", () => {
  assert.strictEqual(keys.normalizeHlNumber("7612"), "HL7612");
  assert.strictEqual(keys.normalizeHlNumber("hl 7612"), "HL7612");
  assert.strictEqual(keys.confirmedRegistrationNo("HL12"), "");
  assert.strictEqual(keys.confirmedRegistrationNo("12"), "");
  assert.strictEqual(keys.confirmedRegistrationNo(" hl8319 "), "HL8319");
});
test("getRegistrationNo: 필드 우선순위, 숫자 fid 무시, HL fid 인정, 없으면 빈 문자열", () => {
  assert.strictEqual(keys.getRegistrationNo({ hlnbr: "HL1111", registrationNo: "HL2222" }), "HL1111");
  assert.strictEqual(keys.getRegistrationNo({ hlnbr: "x", registrationNo: "2222" }), "HL2222");
  assert.strictEqual(keys.getRegistrationNo({ fid: "12345" }), "");
  assert.strictEqual(keys.getRegistrationNo({ fid: "HL7420" }), "HL7420");
  assert.strictEqual(keys.getRegistrationNo({}), "");
  assert.strictEqual(keys.getRegistrationNo(undefined), "");
});

/* ───────── 등록번호 우선순위 ───────── */
const r1031 = row("KJ951", "ICN", "HAN", "202610310045");

test("엑셀 업로드 후 매뉴얼 수정(더 최근) → 매뉴얼 값", () => {
  const records = reg.mergeAircraftRegistrationRecords(
    [rec("2026-10-31", "KJ951", "ICN", "HAN", "HL7620", "2026-11-01T01:00:00Z")], // 엑셀
    [rec("2026-10-31", "KJ951", "ICN", "HAN", "HL7420", "2026-11-01T02:00:00Z")], // 매뉴얼
  );
  const [out] = reg.applyRegistrationToRows([{ ...r1031, hlnbr: "HL7620", registrationNo: "HL7620" }], records);
  assert.strictEqual(out.registrationNo, "HL7420");
});
test("매뉴얼 수정 후 엑셀 업로드(더 최근) → 엑셀 값", () => {
  const records = reg.mergeAircraftRegistrationRecords(
    [rec("2026-10-31", "KJ951", "ICN", "HAN", "HL7420", "2026-11-01T01:00:00Z")],
    [rec("2026-10-31", "KJ951", "ICN", "HAN", "HL7620", "2026-11-01T02:00:00Z")],
  );
  const [out] = reg.applyRegistrationToRows([{ ...r1031, registrationNo: "HL7420" }], records);
  assert.strictEqual(out.registrationNo, "HL7620");
});
test("키(노선 표기)만 달라도 가장 최근 기록이 이김", () => {
  const records = [
    rec("2026-10-31", "KJ951", "", "", "HL7620", "2026-11-01T01:00:00Z"), // 노선 없는 엑셀
    rec("2026-10-31", "KJ951", "ICN", "HAN", "HL7420", "2026-11-01T02:00:00Z"), // 매뉴얼
  ];
  assert.strictEqual(reg.applyRegistrationToRows([r1031], records)[0].registrationNo, "HL7420");
  const reversed = [records[0], { ...records[1], updatedAt: "2026-11-01T00:00:00Z" }];
  assert.strictEqual(reg.applyRegistrationToRows([r1031], reversed)[0].registrationNo, "HL7620");
});
test("같은 편명 다른 날짜는 날짜별로 구분, 기록 없는 날짜를 편명만으로 덮지 않음", () => {
  const records = [
    rec("2026-10-30", "KJ283", "SFO", "ICN", "HL7620", "t1"),
    rec("2026-10-31", "KJ283", "SFO", "ICN", "HL7423", "t1"),
  ];
  const a = reg.applyRegistrationToRows([row("KJ283", "SFO", "ICN", "202610300305")], records)[0];
  const b = reg.applyRegistrationToRows([row("KJ283", "SFO", "ICN", "202610310305")], records)[0];
  const c = reg.applyRegistrationToRows([row("KJ283", "SFO", "ICN", "202611050305")], records)[0];
  assert.strictEqual(a.registrationNo, "HL7620");
  assert.strictEqual(b.registrationNo, "HL7423");
  assert.strictEqual(c.registrationNo, undefined); // HL이 둘이라 편명 단독 규칙 미적용
});
test("편명 단독 기록(HL 하나뿐)은 비어 있는 행에만 채우고 기존 값은 유지", () => {
  const records = [rec("2026-10-01", "KJ247", "ATL", "ICN", "HL8000", "t1")];
  const empty = reg.applyRegistrationToRows([row("KJ247", "ATL", "ICN", "202611050020")], records)[0];
  const kept = reg.applyRegistrationToRows([row("KJ247", "ATL", "ICN", "202611050020", undefined, { registrationNo: "HL9000" })], records)[0];
  assert.strictEqual(empty.registrationNo, "HL8000");
  assert.strictEqual(kept.registrationNo, "HL9000");
});
test("지연 편: 변경일이 다음 날이어도 예정일 기록을 찾음", () => {
  const delayed = row("KJ283", "SFO", "ICN", "202610310305", "202611011500");
  const out = reg.applyRegistrationToRows([delayed], [rec("2026-10-31", "KJ283", "SFO", "ICN", "HL7423", "t1")])[0];
  assert.strictEqual(out.registrationNo, "HL7423");
});
test("이전 스케줄 행 값: DB 기록이 없으면 사용, DB 기록이 있으면 DB가 우선", () => {
  const target = row("KJ919", "ICN", "CTU", "202610302320");
  const prev = [row("KJ919", "ICN", "CTU", "202610302320", undefined, { hlnbr: "HL7777" })];
  assert.strictEqual(reg.applyRegistrationToRows([target], [], prev)[0].registrationNo, "HL7777");
  const withDb = reg.applyRegistrationToRows([target], [rec("2026-10-30", "KJ919", "ICN", "CTU", "HL8338", "t1")], prev)[0];
  assert.strictEqual(withDb.registrationNo, "HL8338");
});
test("등록번호를 알 수 없으면 행을 그대로 반환", () => {
  const target = row("KJ111", "ICN", "HKG", "202610302250");
  assert.strictEqual(reg.applyRegistrationToRows([target], [])[0], target);
});
test("기록 병합: 같은 키는 최근 값, 정렬", () => {
  const merged = reg.mergeAircraftRegistrationRecords(
    [rec("2026-10-31", "KJ2", "A", "B", "HL1111", "2")],
    [rec("2026-10-31", "KJ2", "A", "B", "HL2222", "1"), rec("2026-10-30", "KJ9", "A", "B", "HL3333", "1")],
  );
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[0].flight, "KJ9");
  assert.strictEqual(merged.find((r) => r.flight === "KJ2").registrationNo, "HL1111"); // 더 최근(2) 유지
});

test("저장 시 이미 같은 값으로 저장된 기록은 제외(다른 기기의 최신 수정을 덮지 않음)", () => {
  const existing = [rec("2026-10-31", "KJ951", "ICN", "HAN", "HL7999", "2026-11-01T05:00:00Z"), rec("2026-10-31", "KJ247", "ATL", "ICN", "HL8000", "t1")];
  const incoming = [
    rec("2026-10-31", "KJ951", "ICN", "HAN", "HL7999", "NEW"),   // 같은 값 → 제외
    rec("2026-10-31", "KJ247", "ATL", "ICN", "HL8100", "NEW"),   // 값이 바뀜 → 포함
    rec("2026-10-31", "KJ111", "ICN", "HKG", "HL7000", "NEW"),   // 새 기록 → 포함
  ];
  const out = reg.excludeUnchangedRegistrationRecords(incoming, existing);
  assert.deepStrictEqual(out.map((r) => r.flight), ["KJ247", "KJ111"]);
  assert.deepStrictEqual(reg.excludeUnchangedRegistrationRecords(incoming, []).length, 3);
});

/* ───────── 엑셀 업로드 매칭 ───────── */
const xl = (flight, date, dep, arr, hl, time) => ({ flight, date, departureCode: dep, arrivalCode: arr, registrationNo: hl, afocsSkd: "", time });
test("엑셀 행 매칭: 같은 일자의 한 줄이면 출발/도착 코드가 달라도 적용(엑셀 오타·노선 변경 대응)", () => {
  const apiRow = row("KJ932", "HAN", "ICN", "202611061420");
  const matched = helpers.findBestExcelRowForScheduleRow([xl("KJ932", "2026-11-06", "CAN", "ICN", "HL7436", "14:20")], apiRow);
  assert.ok(matched, "KJ932(엑셀 CAN→ICN, 조회 HAN→ICN)이 적용되어야 함");
  assert.strictEqual(matched.registrationNo, "HL7436");
  const apiRow2 = row("KJ587", "ICN", "BRU", "202611061615");
  assert.ok(helpers.findBestExcelRowForScheduleRow([xl("KJ587", "2026-11-06", "ICN", "ANC", "HL7436", "16:15")], apiRow2), "KJ587(엑셀 ICN→ANC, 조회 ICN→BRU)도 적용");
});
test("엑셀 행 매칭: 일자가 다른 한 줄은 적용하지 않음", () => {
  const apiRow = row("KJ932", "HAN", "ICN", "202611061420");
  assert.strictEqual(helpers.findBestExcelRowForScheduleRow([xl("KJ932", "2026-11-07", "HAN", "ICN", "HL7436", "14:20")], apiRow), null);
});
test("엑셀 행 매칭: 같은 편명이 여러 날이면 일자·노선·시각이 맞는 행만", () => {
  const apiRow = row("KJ283", "SFO", "ICN", "202611050305");
  const cands = [xl("KJ283", "2026-11-04", "SFO", "ICN", "HL7620", "03:05"), xl("KJ283", "2026-11-05", "SFO", "ICN", "HL7423", "03:05")];
  assert.strictEqual(helpers.findBestExcelRowForScheduleRow(cands, apiRow).registrationNo, "HL7423");
});

test("엑셀 업로드 점검: 이번 조회 밖(조회 기간 밖/일자 다름)과 노선이 다른 편을 구분", () => {
  const rows = [row("KJ932", "HAN", "ICN", "202611061420"), row("KJ587", "ICN", "BRU", "202611061615"), row("KJ951", "ICN", "HAN", "202611062345")];
  const excel = [
    xl("KJ932", "2026-11-06", "CAN", "ICN", "HL7436", "14:20"),
    xl("KJ587", "2026-11-06", "ICN", "ANC", "HL7436", "16:15"),
    xl("KJ951", "2026-11-07", "ICN", "HAN", "HL7620", "23:45"),   // 같은 편명, 다른 일자
    xl("KJ999", "2026-11-06", "ICN", "HKG", "HL7000", "10:00"),   // 조회 기간 밖
    xl("KJ111", "2026-11-06", "ICN", "HKG", "", ""),              // 값이 없는 줄은 점검 대상 아님
  ];
  const pairs = rows.map((r) => ({ r, e: helpers.findBestExcelRowForScheduleRow(excel, r) })).filter((p) => p.e).map((p) => ({ excel: p.e, row: p.r }));
  assert.strictEqual(pairs.length, 2);
  const report = helpers.buildExcelUploadReport(excel, rows, pairs);
  assert.deepStrictEqual(report.unmatched.map((u) => u.flight + ":" + u.reason + ":" + u.saved), ["KJ951:일자가 다름:true", "KJ999:조회 기간 밖:true"]);
  assert.deepStrictEqual(report.routeDiffs.map((d) => d.flight + " " + d.excelRoute + "/" + d.rowRoute), ["KJ932 CAN→ICN/HAN→ICN", "KJ587 ICN→ANC/ICN→BRU"]);
  const text = helpers.formatExcelUploadReport(report);
  assert.strictEqual(text, " · 이번 조회 밖 2건(등록기호는 기록에 저장됨) · 노선 다름 2건(엑셀 값 반영)");
});
test("엑셀 업로드 점검: 문제가 없으면 빈 문자열, 한 줄 요약은 편 수와 관계없이 짧음", () => {
  const rows = [row("KJ247", "ATL", "ICN", "202611060020")];
  const excel = [xl("KJ247", "2026-11-06", "ATL", "ICN", "HL8000", "00:20")];
  const pairs = [{ excel: excel[0], row: rows[0] }];
  assert.strictEqual(helpers.formatExcelUploadReport(helpers.buildExcelUploadReport(excel, rows, pairs)), "");
  const many = Array.from({ length: 51 }, (_, i) => xl("KJ" + (500 + i), "2026-11-05", "ICN", "HKG", "HL7000", "10:00"));
  const text = helpers.formatExcelUploadReport(helpers.buildExcelUploadReport(many, rows, []));
  assert.ok(text.includes("이번 조회 밖 51건") && text.length < 60, text);
  const noDate = [xl("KJ600", "", "ICN", "HKG", "HL7000", "10:00"), ...many.slice(0, 2)];
  const t2 = helpers.formatExcelUploadReport(helpers.buildExcelUploadReport(noDate, rows, []));
  assert.ok(t2.includes("그중 2건 기록에 저장됨"), t2);
});

/* ───────── 서버 기록과 브라우저 기록 동기화 ───────── */
const setLocal = (records) => store["cargo_ops_aircraft_registration_records_v1"] = JSON.stringify(records);
const getLocal = () => JSON.parse(store["cargo_ops_aircraft_registration_records_v1"] || "[]");
function fakeServer(initial, opts = {}) {
  const server = { records: [...initial], posts: [] };
  global.fetch = async (url, init) => {
    if (opts.failGet && (!init || !init.method)) return { ok: false, json: async () => ({ success: false, detail: "503" }) };
    if (init && init.method === "POST") {
      const body = JSON.parse(init.body);
      if (opts.failPost) return { ok: false, json: async () => ({ success: false, detail: "502" }) };
      server.posts.push(body);
      const map = new Map(server.records.map((r) => [[r.date, r.flight, r.departureCode, r.arrivalCode].join("|"), r]));
      body.records.forEach((r) => { const k = [r.date, r.flight, r.departureCode, r.arrivalCode].join("|"); const old = map.get(k); if (!old || Date.parse(r.updatedAt) >= Date.parse(old.updatedAt)) map.set(k, r); });
      server.records = [...map.values()];
    }
    return { ok: true, json: async () => ({ success: true, records: server.records }) };
  };
  return server;
}
const L3 = [
  rec("2026-11-06", "KJ977", "ICN", "TSN", "HL8355", "2026-11-05T06:00:00.000Z"),
  rec("2026-11-06", "KJ918", "TAO", "ICN", "HL8319", "2026-11-05T06:00:00.000Z"),
  rec("2026-11-06", "KJ978", "TSN", "ICN", "HL8355", "2026-11-05T06:00:00.000Z"),
];
async function syncTests() {
  await atest("★ 서버가 비어도 브라우저 기록을 지우지 않고 서버로 복구(홈·AFOCS 화면 포함)", async () => {
    setLocal(L3); const server = fakeServer([]);
    const out = await reg.fetchAircraftRegistrationRecordsFromServer();
    assert.strictEqual(out.length, 3);
    assert.strictEqual(getLocal().length, 3, "브라우저 기록이 유지되어야 함");
    assert.strictEqual(server.records.length, 3, "서버로 다시 올라가야 함");
  });
  await atest("서버에만 있는 기록은 브라우저로 가져오고, 브라우저가 비어 있어도 정상", async () => {
    setLocal([]); fakeServer(L3);
    const out = await reg.fetchAircraftRegistrationRecordsFromServer();
    assert.strictEqual(out.length, 3); assert.strictEqual(getLocal().length, 3);
  });
  await atest("같은 운항은 나중에 저장한 값이 이김: 서버가 최신이면 서버 값, 브라우저가 최신이면 서버로 올림", async () => {
    setLocal(L3); fakeServer([rec("2026-11-06", "KJ977", "ICN", "TSN", "HL9999", "2026-11-05T08:00:00.000Z")]);
    let out = await reg.fetchAircraftRegistrationRecordsFromServer();
    assert.strictEqual(out.find((r) => r.flight === "KJ977").registrationNo, "HL9999");
    setLocal([rec("2026-11-06", "KJ977", "ICN", "TSN", "HL7777", "2026-11-05T09:00:00.000Z")]);
    const server = fakeServer([rec("2026-11-06", "KJ977", "ICN", "TSN", "HL9999", "2026-11-05T08:00:00.000Z")]);
    out = await reg.fetchAircraftRegistrationRecordsFromServer();
    assert.strictEqual(out.find((r) => r.flight === "KJ977").registrationNo, "HL7777");
    assert.strictEqual(server.records[0].registrationNo, "HL7777");
  });
  await atest("시각 형식이 섞여도 정확히 비교(+09:00 15:00 = 06:00Z, 서버 07:00Z가 더 최근)", async () => {
    setLocal([rec("2026-11-06", "KJ977", "ICN", "TSN", "HL1111", "2026-11-05T15:00:00+09:00")]);
    fakeServer([rec("2026-11-06", "KJ977", "ICN", "TSN", "HL2222", "2026-11-05T07:00:00.000Z")]);
    const out = await reg.fetchAircraftRegistrationRecordsFromServer();
    assert.strictEqual(out[0].registrationNo, "HL2222");
  });
  await atest("서버 조회 실패 시 예외를 던지고 브라우저 기록은 그대로", async () => {
    setLocal(L3); fakeServer([], { failGet: true });
    await assert.rejects(() => reg.fetchAircraftRegistrationRecordsFromServer());
    assert.strictEqual(getLocal().length, 3);
  });
  await atest("서버로 올리는 데 실패해도 브라우저 기록은 보존(다음에 다시 시도)", async () => {
    setLocal(L3); fakeServer([], { failPost: true });
    const out = await reg.fetchAircraftRegistrationRecordsFromServer();
    assert.strictEqual(out.length, 3); assert.strictEqual(getLocal().length, 3);
  });
}

/* ───────── 스케줄 저장소 ───────── */
const room = (over = {}) => ({
  id: "r1", name: "n", flightsInput: "KJ247, KJ972", startDateTime: "", endDateTime: "", fixed: true, lastFetchedAt: "",
  rows: [row("KJ247", "ATL", "ICN", "202610310020"), row("KJ972", "HKG", "ICN", "202610310725"), row("KJ999", "ICN", "HKG", "202610310800")],
  ...over,
});
test("isActiveScheduleRoom / removeEmptyScheduleRooms", () => {
  assert.strictEqual(sched.isActiveScheduleRoom(null), false);
  assert.strictEqual(sched.isActiveScheduleRoom(room({ flightsInput: "", rows: [] })), false);
  assert.strictEqual(sched.isActiveScheduleRoom(room()), true);
  assert.strictEqual(sched.removeEmptyScheduleRooms([room({ flightsInput: "", rows: [] }), room({ fixed: false, flightsInput: "", rows: [] })]).length, 1);
});
test("normalizeScheduleRoomRows: 목록에 없는 행 제거, 목록이 비면 행도 비움(삭제 유지)", () => {
  const n = sched.normalizeScheduleRoomRows(room());
  assert.deepStrictEqual(n.rows.map((r) => r.flightId), ["KJ247", "KJ972"]);
  assert.strictEqual(sched.normalizeScheduleRoomRows(room({ flightsInput: "" })).rows.length, 0);
});
test("removeFlightFromScheduleRoom: 목록과 행에서 함께 제거", () => {
  const n = sched.removeFlightFromScheduleRoom(room(), "972");
  assert.strictEqual(n.flightsInput, "KJ247");
  assert.deepStrictEqual(n.rows.map((r) => r.flightId), ["KJ247", "KJ999"]);
});
test("mergeLatestScheduleRoom: 최신 고정 방을 맨 앞에, 기존 고정 방은 대체", () => {
  const local = [room({ id: "old", fixed: true }), room({ id: "free", fixed: false })];
  const merged = sched.mergeLatestScheduleRoom(local, room({ id: "new" }));
  assert.deepStrictEqual(merged.map((r) => r.id), ["new", "free"]);
  assert.deepStrictEqual(sched.mergeLatestScheduleRoom(local, null).map((r) => r.id), ["free"]);
});
test("loadRooms / saveRooms 왕복, 비어 있는 고정 방은 걸러짐", () => {
  sched.saveRooms([room(), room({ id: "empty", flightsInput: "", rows: [] })]);
  assert.deepStrictEqual(sched.loadRooms().map((r) => r.id), ["r1"]);
});
test("mergeScheduleRegistrationIntoRoom: 기록(최근 저장) > 이전 방 값 > 서버 값", () => {
  const incoming = room({ rows: [row("KJ247", "ATL", "ICN", "202610310020", undefined, { registrationNo: "HL1000" })] });
  const previous = room({ rows: [row("KJ247", "ATL", "ICN", "202610310020", undefined, { registrationNo: "HL2000" })] });
  const noDb = sched.mergeScheduleRegistrationIntoRoom(incoming, previous, []);
  assert.strictEqual(noDb.rows[0].registrationNo, "HL2000"); // 이전(로컬) 방 값이 서버 값보다 우선
  const withDb = sched.mergeScheduleRegistrationIntoRoom(incoming, previous, [rec("2026-10-31", "KJ247", "ATL", "ICN", "HL3000", "t9")]);
  assert.strictEqual(withDb.rows[0].registrationNo, "HL3000");
  assert.strictEqual(sched.mergeScheduleRegistrationIntoRoom(null, previous, []), null);
});

(async () => {
  await syncTests();
  await atest("saveLatestScheduleToServer: 정규화한 방을 보내고 응답에 등록번호를 합침", async () => {
    let sent = null;
    global.fetch = async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ success: true, room: sent.body.room }) };
    };
    const input = room({ rows: [row("KJ247", "ATL", "ICN", "202610310020", undefined, { registrationNo: "HL4444" }), row("KJ999", "ICN", "HKG", "202610310800")] });
    const saved = await sched.saveLatestScheduleToServer(input);
    assert.ok(sent.url.endsWith("/flights/latest-schedule"));
    assert.deepStrictEqual(sent.body.room.rows.map((r) => r.flightId), ["KJ247", "KJ972"].filter((f) => f === "KJ247")); // KJ972 행이 없으므로 KJ247만
    assert.strictEqual(saved.rows[0].registrationNo, "HL4444");
  });
  await atest("saveLatestScheduleToServer: 서버 오류는 예외", async () => {
    global.fetch = async () => ({ ok: false, json: async () => ({ success: false, detail: "boom" }) });
    await assert.rejects(() => sched.saveLatestScheduleToServer(room()), /boom/);
  });
  await atest("loadLatestScheduleFromServer: 비어 있는 방은 null, 있으면 로컬 등록번호 합침", async () => {
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, room: room({ flightsInput: "", rows: [] }) }) });
    assert.strictEqual(await sched.loadLatestScheduleFromServer(), null);
    sched.saveRooms([room({ rows: [row("KJ247", "ATL", "ICN", "202610310020", undefined, { registrationNo: "HL5555" })] })]);
    global.fetch = async () => ({ ok: true, json: async () => ({ success: true, room: room({ rows: [row("KJ247", "ATL", "ICN", "202610310020")] }) }) });
    const loaded = await sched.loadLatestScheduleFromServer();
    assert.strictEqual(loaded.rows[0].registrationNo, "HL5555");
  });

  // CSM CHECK LIST 전달: 일일 보고 "주요 사항" → "CSM Report 내용"
  const csm = require(path.join(outDir, "app/lib/csm-checklist.js"));
  const decodeImport = (url) => {
    const b64 = new URL(url).searchParams.get("scheduleImport").replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  };
  test("CSM 전달: 주요 사항 메모가 reportText 로 함께 전달됨(줄바꿈·한글 보존)", () => {
    const text = "- KJ371 AAP 점검(22:10 탑재 완료)\r\n- KJ947 AAP 점검(KJ284 동시 탑재)\n* kj284 nose door 탑재 등 중량 CGO 탑재로 탑재  지연(23:00~00:40)";
    const built = csm.buildCsmChecklistImportUrl([{ flight: "371", spot: "621", type: "A" }], { baseUrl: "https://csm.test", report: { text, workDate: "2026-11-05" } });
    const payload = decodeImport(built.url);
    assert.strictEqual(built.reportSent, true);
    assert.strictEqual(payload.reportText, text.replace(/\r\n/g, "\n"));
    assert.strictEqual(payload.reportDate, "2026-11-05");
    assert.strictEqual(payload.flights.length, 1);
  });
  test("CSM 전달: 메모가 비어 있으면 reportText 를 보내지 않음(기존 방식 유지)", () => {
    const built = csm.buildCsmChecklistImportUrl([{ flight: "371", spot: "621", type: "A" }], { baseUrl: "https://csm.test", report: { text: "  \n " } });
    assert.strictEqual(built.reportSent, false);
    assert.ok(!("reportText" in decodeImport(built.url)));
    const noReport = csm.buildCsmChecklistImportUrl([{ flight: "371", spot: "621", type: "A" }], { baseUrl: "https://csm.test" });
    assert.deepStrictEqual(Object.keys(decodeImport(noReport.url)), ["flights"]);
  });
  test("CSM 전달: 너무 긴 메모는 1500자에서 자르고 알림", () => {
    const built = csm.buildCsmChecklistImportUrl([{ flight: "1", spot: "", type: "A" }], { baseUrl: "https://csm.test", report: { text: "가".repeat(2000) } });
    assert.strictEqual(built.reportTruncated, true);
    assert.strictEqual(decodeImport(built.url).reportText.length, 1500);
    assert.ok(built.url.length < 8000, "URL 길이 " + built.url.length);
  });

  // 자동 푸시 상태 요약(기기 수·마지막 확인·멈춤 경고)
  const homeHelpers = require(path.join(outDir, "app/home/helpers.js"));
  test("자동 확인 상태: 모드 문구가 중복되지 않고 기기 수·마지막 확인 표시", () => {
    const sum = homeHelpers.buildAutoPushSummary({ enabled: true, mode: "normal", intervalMinutes: 30, lastMessage: "자동 확인 완료(일반 30분): 변경 없음, 재조회 6건", lastRunAt: "2026-11-06T09:00:00", nowKst: "2026-11-06T09:12:00", subscriptionCount: 2 });
    assert.strictEqual(sum.message, "자동 확인 완료(일반 30분): 변경 없음, 재조회 6건");
    assert.strictEqual(sum.deviceCount, 2);
    assert.strictEqual(sum.lastRunText, "마지막 자동 확인 09:00 (12분 전)");
    assert.strictEqual(sum.staleWarning, "");
  });
  test("자동 확인 상태: 오래 멈췄으면 경고(일반 30분 → 65분 초과, 집중 5분 → 15분 초과)", () => {
    const stale = homeHelpers.buildAutoPushSummary({ enabled: true, mode: "normal", intervalMinutes: 30, lastMessage: "x", lastRunAt: "2026-11-06T09:00:00", nowKst: "2026-11-06T10:10:00" });
    assert.ok(stale.staleWarning.includes("70분"), stale.staleWarning);
    const ok = homeHelpers.buildAutoPushSummary({ enabled: true, mode: "normal", intervalMinutes: 30, lastMessage: "x", lastRunAt: "2026-11-06T09:00:00", nowKst: "2026-11-06T10:00:00" });
    assert.strictEqual(ok.staleWarning, "");
    const focus = homeHelpers.buildAutoPushSummary({ enabled: true, mode: "focus", intervalMinutes: 5, lastMessage: "x", lastRunAt: "2026-11-06T09:00:00", nowKst: "2026-11-06T09:20:00" });
    assert.ok(focus.staleWarning.length > 0);
    const paused = homeHelpers.buildAutoPushSummary({ enabled: false, mode: "normal", intervalMinutes: 30, lastMessage: "x", lastRunAt: "2026-11-06T01:00:00", nowKst: "2026-11-06T10:00:00" });
    assert.strictEqual(paused.staleWarning, "");
  });
  test("자동 확인 상태: 모드 표시가 없는 문구에는 모드를 붙이고, 기록이 없으면 안내", () => {
    const a = homeHelpers.buildAutoPushSummary({ enabled: true, mode: "focus", lastMessage: "Schedule Flight 기준 자동 변경 확인 대기 중" });
    assert.strictEqual(a.message, "집중 5분 확인 · Schedule Flight 기준 자동 변경 확인 대기 중");
    assert.strictEqual(a.lastRunText, "아직 자동 확인 기록이 없습니다.");
  });

  // 도착 예정 시각이 지났지만 인천 API 가 도착을 알리지 않은 편 → '도착 지연'
  const fstatus = require(path.join(outDir, "app/lib/flight-status.js"));
  const past = "2000/01/01 10:00";
  const arrivalRow = (extra) => ({ departureCode: "HKG", arrivalCode: "ICN", sourceType: "arrival", formattedScheduleTime: past, formattedEstimatedTime: past, ...extra });
  test("도착편: 시각이 지났고 API 상태가 비어 있으면 '도착 지연'", () => {
    assert.strictEqual(fstatus.getComputedFlightStatus(arrivalRow({ remark: "", status: "" })), "도착 지연");
  });
  test("도착편: remark 가 지연이고 시각이 지나도 '도착'이 아니라 '도착 지연'", () => {
    assert.strictEqual(fstatus.getComputedFlightStatus(arrivalRow({ remark: "지연", delay: true })), "도착 지연");
  });
  test("도착편: 추정으로 붙은 status 도착(statusInferred)은 도착으로 보지 않음", () => {
    assert.strictEqual(fstatus.getComputedFlightStatus(arrivalRow({ remark: "지연", status: "도착", statusInferred: true })), "도착 지연");
    assert.strictEqual(fstatus.getComputedFlightStatus(arrivalRow({ remark: "", status: "도착 지연", statusInferred: true })), "도착 지연");
  });
  test("도착편: API remark 가 도착이면 '도착', 지연이 함께면 '도착(지연)'", () => {
    assert.strictEqual(fstatus.getComputedFlightStatus(arrivalRow({ remark: "도착", status: "도착" })), "도착");
    assert.strictEqual(fstatus.getComputedFlightStatus(arrivalRow({ remark: "도착", status: "도착", delay: true })), "도착(지연)");
  });
  test("출발편: 시각이 지났어도 API remark 가 출발이 아니면 '출발 지연', remark 출발이면 '출발'", () => {
    const dep = (extra) => ({ departureCode: "ICN", arrivalCode: "PVG", sourceType: "departure", formattedEstimatedTime: past, ...extra });
    assert.strictEqual(fstatus.getComputedFlightStatus(dep({ remark: "" })), "출발 지연");
    assert.strictEqual(fstatus.getComputedFlightStatus(dep({ remark: "지연", delay: true })), "출발 지연");
    assert.strictEqual(fstatus.getComputedFlightStatus(dep({ remark: "지연", status: "출발", statusInferred: true })), "출발 지연");
    assert.strictEqual(fstatus.getComputedFlightStatus(dep({ remark: "출발", status: "출발" })), "출발");
    assert.strictEqual(fstatus.getComputedFlightStatus(dep({ remark: "출발", status: "출발", delay: true })), "출발(지연)");
  });
  test("'도착 지연'은 진행 중(완료 아님), '도착'·'도착(지연)'은 완료", () => {
    assert.strictEqual(fstatus.isFinalCompletedFlightStatus("도착 지연"), false);
    assert.strictEqual(fstatus.isFinalCompletedFlightStatus("출발 지연"), false);
    assert.strictEqual(fstatus.isFinalCompletedFlightStatus("출발"), true);
    assert.strictEqual(fstatus.isFinalCompletedFlightStatus("도착"), true);
    assert.strictEqual(fstatus.isFinalCompletedFlightStatus("도착(지연)"), true);
    assert.strictEqual(fstatus.isFinalCompletedFlightStatus("결항"), true);
  });

  // Monthly Scheduled Flight
  const monthly = require(path.join(outDir, "app/lib/monthly-schedule.js"));
  test("근무조: A 06:31~14:00, C 14:01~23:59, S 22:01~익일 06:30 (22:01~23:59는 C·S 모두)", () => {
    const D = "2026-11-06";
    const at = (t) => ["A", "C", "S"].filter((sh) => monthly.isInShift(t, D, sh)).join("");
    assert.strictEqual(at("2026-11-06 06:30"), "");
    assert.strictEqual(at("2026-11-06 06:31"), "A");
    assert.strictEqual(at("2026-11-06 14:00"), "A");
    assert.strictEqual(at("2026-11-06 14:01"), "C");
    assert.strictEqual(at("2026-11-06 22:00"), "C");
    assert.strictEqual(at("2026-11-06 22:01"), "CS");
    assert.strictEqual(at("2026-11-06 23:30"), "CS");
    assert.strictEqual(at("2026-11-06 23:59"), "CS");
    assert.strictEqual(at("2026-11-07 00:00"), "S");
    assert.strictEqual(at("2026-11-07 06:30"), "S");
    assert.strictEqual(at("2026-11-07 06:31"), "");
    assert.strictEqual(at("2026-11-06 02:00"), "", "선택 일자의 새벽은 전날 업무일자의 S조");
    // 겹치는 구간은 22:01~23:59(C·S)뿐이고, 06:31~06:31 이후 낮 시간대는 빠짐없이 A/C 중 하나에 속한다
    for (let h = 0; h < 24; h++) for (const m of [0, 1, 30, 31, 59]) {
      const t = "2026-11-06 " + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
      const hm = t.slice(11);
      const expected = hm >= "22:01" ? 2 : hm >= "06:31" ? 1 : 0;
      assert.strictEqual(at(t).length, expected, t + " → " + at(t));
    }
  });
  test("담당: 기본 A·B 두 칸, 3칸 선택 시 A·B·C, 이름 있으면 A(이름)", () => {
    const f = (k, slot = "") => ({ recordKey: k, assigneeSlot: slot });
    const list = [f("1"), f("2"), f("3"), f("4"), f("5")];
    assert.deepStrictEqual(monthly.activeSlots(), ["A", "B"]);
    assert.deepStrictEqual(monthly.activeSlots(2), ["A", "B"]);
    assert.deepStrictEqual(monthly.activeSlots(3), ["A", "B", "C"]);
    assert.deepStrictEqual(Object.values(monthly.assignSlots(list, monthly.activeSlots(2))), ["A", "B", "A", "B", "A"]);
    assert.deepStrictEqual(Object.values(monthly.assignSlots(list, monthly.activeSlots(3))), ["A", "B", "C", "A", "B"]);
    // 편별 지정은 그대로 쓰고, 그 다음 편은 지정한 담당 다음 칸부터 이어진다. 사용하지 않는 칸(C) 지정은 자동 배정으로 돌아간다
    assert.deepStrictEqual(monthly.assignSlots([f("1"), f("2"), f("3", "A"), f("4")], ["A", "B", "C"]), { 1: "A", 2: "B", 3: "A", 4: "B" });
    assert.deepStrictEqual(Object.values(monthly.assignSlots([f("1", "C"), f("2"), f("3")], ["A", "B"])), ["A", "B", "A"]);
    const names = { nameA: "홍길동", nameB: "", nameC: "김철수" };
    assert.strictEqual(monthly.assigneeLabel("A", names), "A(홍길동)");
    assert.strictEqual(monthly.assigneeLabel("B", names), "B", "이름이 없으면 A/B/C 글자만");
    assert.strictEqual(monthly.assigneeLabel("C", names), "C(김철수)");
    assert.strictEqual(monthly.assigneeLabel("A", null), "A");
    assert.strictEqual(monthly.assigneeLabel("B", { nameA: "", nameB: "  ", nameC: "" }), "B");
  });
  test("AFOCS 엑셀 머리글 APR(도착지)도 도착지 열로 읽음: ICN 출발편의 ARR 이 비지 않음", () => {
    const res = monthly.parseSkdMatrix([
      ["편명", "등록기호", "DEP", "APR", "ETD/ETA", "담당자", "T/O R/I", "주기장"],
      ["KJ587", "HL7436", "ICN", "BRU", "2026-11-06 16:15", "", "", "621"],
      ["KJ932", "HL7436", "CAN", "ICN", "2026-11-06 14:20", "", "", "621"],
    ]);
    assert.deepStrictEqual(res.records.map((r) => [r.flight, r.departureCode, r.arrivalCode]), [["KJ587", "ICN", "BRU"], ["KJ932", "CAN", "ICN"]]);
  });
  test("담당이 박종규이면 강조 대상(배정된 칸의 이름 기준)", () => {
    const names = { nameA: "홍길동", nameB: "박종규", nameC: "" };
    assert.strictEqual(monthly.HIGHLIGHT_ASSIGNEE, "박종규");
    assert.strictEqual(monthly.isHighlightedAssignee("B", names), true);
    assert.strictEqual(monthly.isHighlightedAssignee("A", names), false);
    assert.strictEqual(monthly.isHighlightedAssignee("C", names), false, "이름이 없으면 강조 안 함");
    assert.strictEqual(monthly.isHighlightedAssignee("A", { nameA: " 박종규 ", nameB: "", nameC: "" }), true, "앞뒤 공백 무시");
    assert.strictEqual(monthly.isHighlightedAssignee("A", { nameA: "박종규철", nameB: "", nameC: "" }), false, "이름이 정확히 같을 때만");
  });
  test("시각 안내: API 변경(예정→변경)·SKD 대비(SKD→현재), SKD=API 예정이면 SKD 줄 생략, 날짜는 선택 일자와 다를 때만", () => {
    // KJ390: API 예정과 SKD 가 다르고 둘 다 현재와 다름 → 두 줄
    const f = { apiSchedTime: "2026-11-06 12:10", apiTime: "2026-11-07 08:05", skdTime: "2026-11-06 18:25" };
    assert.deepStrictEqual(monthly.timeChangeLines(f, "2026-11-07"), [
      { label: "API 변경", text: "11-06 12:10 → 08:05" },
      { label: "SKD 대비", text: "11-06 18:25 → 08:05" },
    ]);
    // KJ386: SKD = API 예정, API 가 앞당김 → 같은 내용이므로 API 변경 한 줄만
    const k = { apiSchedTime: "2026-11-09 06:50", apiTime: "2026-11-09 06:22", skdTime: "2026-11-09 06:50" };
    assert.deepStrictEqual(monthly.timeChangeLines(k, "2026-11-08"), [{ label: "API 변경", text: "11-09 06:50 → 11-09 06:22" }]);
    // 같은 날 변경: 시각만
    const g = { apiSchedTime: "2026-11-06 14:20", apiTime: "2026-11-06 14:35", skdTime: "2026-11-06 14:20" };
    assert.deepStrictEqual(monthly.timeChangeLines(g, "2026-11-06"), [{ label: "API 변경", text: "14:20 → 14:35" }]);
    // API 는 그대로(예정=변경)인데 SKD 와만 다른 경우(KJ957)
    const h = { apiSchedTime: "2026-11-07 09:35", apiTime: "2026-11-07 09:35", skdTime: "2026-11-07 12:10" };
    assert.deepStrictEqual(monthly.timeChangeLines(h, "2026-11-07"), [{ label: "SKD 대비", text: "12:10 → 09:35" }]);
    // 변동 없음 / API 값 없음
    assert.deepStrictEqual(monthly.timeChangeLines({ apiSchedTime: "2026-11-07 09:35", apiTime: "2026-11-07 09:35", skdTime: "2026-11-07 09:35" }, "2026-11-07"), []);
    assert.deepStrictEqual(monthly.timeChangeLines({ apiSchedTime: "", apiTime: "", skdTime: "2026-11-07 09:35" }, "2026-11-07"), []);
    // 예전 데이터(API 예정시각 없음): SKD 변경만
    assert.deepStrictEqual(monthly.timeChangeLines({ apiSchedTime: "", apiTime: "2026-11-07 10:00", skdTime: "2026-11-07 09:35" }, "2026-11-07"), [{ label: "SKD 대비", text: "09:35 → 10:00" }]);
  });
  test("담당 배정 순서는 API 시각 기준: 유형 2(SKD 순)에서도 같은 담당", () => {
    const flights = [
      { recordKey: "a", flight: "KJ1", skdTime: "2026-11-06 10:00", apiTime: "2026-11-06 12:00", assigneeSlot: "" },
      { recordKey: "b", flight: "KJ2", skdTime: "2026-11-06 11:00", apiTime: "2026-11-06 11:00", assigneeSlot: "" },
      { recordKey: "c", flight: "KJ3", skdTime: "2026-11-06 12:00", apiTime: "", assigneeSlot: "" },
    ];
    const bySkd = monthly.flightsForShift(flights, "2026-11-06", "A", 2).map((f) => f.flight);
    assert.deepStrictEqual(bySkd, ["KJ1", "KJ2", "KJ3"], "유형 2 화면 순서는 SKD 시각 순");
    const order = monthly.sortForAssignment(flights).map((f) => f.flight);
    assert.deepStrictEqual(order, ["KJ2", "KJ1", "KJ3"], "배정 순서는 API 시각(없으면 SKD) 순");
    const slots = monthly.assignSlots(monthly.sortForAssignment(flights), ["A", "B"]);
    assert.deepStrictEqual(slots, { a: "B", b: "A", c: "A" });
    // 유형 1 순서(API 시각 순)로 배정한 것과 같다
    const type1 = monthly.flightsForShift(flights, "2026-11-06", "A", 1);
    assert.deepStrictEqual(monthly.assignSlots(monthly.sortForAssignment(type1), ["A", "B"]), slots);
  });
  test("맨 위 편이 A이면 B,A… / 맨 위가 B이면 A,B… 로 이어서 배정(2칸), 3칸은 B→C→A", () => {
    const f = (k, slot = "") => ({ recordKey: k, assigneeSlot: slot });
    const seq = (list, active) => Object.values(monthly.assignSlots(list, active)).join("");
    assert.strictEqual(seq([f("1"), f("2"), f("3"), f("4"), f("5")], ["A", "B"]), "ABABA", "맨 위 자동(A)");
    assert.strictEqual(seq([f("1", "A"), f("2"), f("3"), f("4"), f("5")], ["A", "B"]), "ABABA", "맨 위 A 지정");
    assert.strictEqual(seq([f("1", "B"), f("2"), f("3"), f("4"), f("5")], ["A", "B"]), "BABAB", "맨 위 B 지정 → 다음 A, 그다음 B");
    assert.strictEqual(seq([f("1", "B"), f("2"), f("3"), f("4")], ["A", "B", "C"]), "BCAB", "3칸: 맨 위 B → C → A → B");
    assert.strictEqual(seq([f("1", "C"), f("2"), f("3"), f("4")], ["A", "B", "C"]), "CABC", "3칸: 맨 위 C → A → B → C");
    // 중간 편을 직접 바꾸면 그 편부터 다시 번갈아 이어진다
    assert.strictEqual(seq([f("1"), f("2"), f("3", "A"), f("4"), f("5")], ["A", "B"]), "ABABA".replace("ABABA", "ABABA"));
    assert.strictEqual(seq([f("1"), f("2"), f("3", "B"), f("4"), f("5")], ["A", "B"]), "ABBAB", "3번째를 B로 지정 → 4번째 A, 5번째 B");
  });
  test("출도착 공항: 한쪽만 있으면 다른 쪽은 ICN, 인천 출발 판정", () => {
    assert.strictEqual(monthly.arrivalOf({ departureCode: "CAN", arrivalCode: "" }), "ICN");
    assert.strictEqual(monthly.arrivalOf({ departureCode: "ICN", arrivalCode: "" }), "");
    assert.strictEqual(monthly.departureOf({ departureCode: "", arrivalCode: "FRA" }), "ICN");
    assert.strictEqual(monthly.isIcnDeparture({ departureCode: "", arrivalCode: "FRA" }), true);
    assert.strictEqual(monthly.isIcnDeparture({ departureCode: "CAN", arrivalCode: "" }), false);
    const res = monthly.parseSkdMatrix([["KJ932", "HL7436", "CAN", "", "2026-11-06 14:20"], ["KJ587", "HL7436", "", "BRU", "2026-11-06 16:15"]]);
    assert.deepStrictEqual(res.records.map((r) => [r.departureCode, r.arrivalCode]), [["CAN", "ICN"], ["ICN", "BRU"]]);
  });
  test("유형 1은 API 변경시각 우선, 유형 2는 SKD 시각", () => {
    const f = { skdTime: "2026-11-06 23:00", apiTime: "2026-11-06 23:40" };
    assert.strictEqual(monthly.displayTime(f, 1), "2026-11-06 23:40");
    assert.strictEqual(monthly.displayTime(f, 2), "2026-11-06 23:00");
    assert.strictEqual(monthly.displayTime({ ...f, apiTime: "" }, 1), "2026-11-06 23:00");
    assert.deepStrictEqual(monthly.type1Dates("2026-11-30"), ["2026-11-30", "2026-12-01", "2026-12-02"]);
  });
  test("근무조 목록: S조는 22:01~익일 새벽 편, C조는 23:59까지, 시간순 정렬", () => {
    const rows = [
      { recordKey: "a", flight: "KJ1", skdTime: "2026-11-07 01:00", apiTime: "" },
      { recordKey: "b", flight: "KJ2", skdTime: "2026-11-06 23:30", apiTime: "" },
      { recordKey: "c", flight: "KJ3", skdTime: "2026-11-06 10:00", apiTime: "2026-11-06 23:10" },
    ];
    assert.deepStrictEqual(monthly.flightsForShift(rows, "2026-11-06", "S", 2).map((r) => r.flight), ["KJ2", "KJ1"]);
    assert.deepStrictEqual(monthly.flightsForShift(rows, "2026-11-06", "C", 2).map((r) => r.flight), ["KJ2"]);
    assert.deepStrictEqual(monthly.flightsForShift(rows, "2026-11-06", "C", 1).map((r) => r.flight), ["KJ3", "KJ2"], "유형 1은 지연된 변경시각으로 근무조 판정");
  });
  test("엑셀 붙여넣기: Daily Job SKD 머리글 양식(담당자·T/O R/I·주기장 열 무시), KJ만, 0 제거", () => {
    const text = [
      "Daily Job SKD (2026-11-06)",
      "편명\t등록기호\tDEP\tARR\tETD ETA\t담당자\tT/O R/I\t주기장",
      "KJ0795\tHL7423\tICN\tFRA\t2026-11-06 23:15\t홍길동\t\t625",
      "OZ0790\tHL7419\tMXP\tICN\t2026-11-06 9:00\t김철수\t\t623",
      "KJ2911\t7417\tORD\tICN\t2026/11/07 0:45\t\t\t623",
      "KJ948\tHL8001\tPVG\tICN\t시각없음",
    ].join("\n");
    const res = monthly.parseSkdMatrix(monthly.textToMatrix(text));
    assert.deepStrictEqual(res.records, [
      { flight: "KJ795", skdTime: "2026-11-06 23:15", departureCode: "ICN", arrivalCode: "FRA", registrationNo: "HL7423" },
      { flight: "KJ2911", skdTime: "2026-11-07 00:45", departureCode: "ORD", arrivalCode: "ICN", registrationNo: "HL7417" },
    ]);
    assert.strictEqual(res.skipped.length, 2);
  });
  test("엑셀 파일 값: 날짜 일련번호, 머리글 없는 순서(편명·등록기호·DEP·ARR·ETD/ETA), 일자+시각 분리 열", () => {
    // 2026-11-06 23:15 = 46332 + 23.25/24
    const serial = 46332 + (23 * 60 + 15) / 1440;
    assert.strictEqual(monthly.parseSkdDateTime(serial), "2026-11-06 23:15");
    const noHeader = monthly.parseSkdMatrix([["KJ970", "HL7620", "HKG", "ICN", serial]]);
    assert.strictEqual(noHeader.records[0].skdTime, "2026-11-06 23:15");
    const split = monthly.parseSkdMatrix([["편명", "일자", "ETD/ETA", "DEP", "ARR"], ["KJ970", "2026-11-06", "07:05", "HKG", "ICN"], ["KJ971", 46332, 0.5, "ICN", "HKG"]]);
    assert.deepStrictEqual(split.records.map((r) => r.skdTime), ["2026-11-06 07:05", "2026-11-06 12:00"]);
  });

  console.log(`\n${passed}개 통과${process.exitCode ? " · 실패 있음" : ""}`);
  fs.rmSync(outDir, { recursive: true, force: true });
})();
