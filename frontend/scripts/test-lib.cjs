// 공용 lib(편명 정규화 · 등록번호 우선순위 · 스케줄 저장소) 단위 테스트
// 실행: cd frontend && node scripts/test-lib.cjs
const ts = require("typescript");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const libDir = path.join(__dirname, "..", "app", "lib");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "cargo-lib-test-"));
for (const f of ["flight-types", "flight-keys", "aircraft-registration", "schedule-store", "api-config", "afocs-skd"]) {
  const src = fs.readFileSync(path.join(libDir, f + ".ts"), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: "commonjs", target: "es2020" } }).outputText;
  fs.writeFileSync(path.join(outDir, f + ".js"), js);
}

// 브라우저 환경 흉내
const store = {};
const mockStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = { localStorage: mockStorage };
global.localStorage = mockStorage;

const keys = require(path.join(outDir, "flight-keys.js"));
const reg = require(path.join(outDir, "aircraft-registration.js"));
const sched = require(path.join(outDir, "schedule-store.js"));

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

  console.log(`\n${passed}개 통과${process.exitCode ? " · 실패 있음" : ""}`);
  fs.rmSync(outDir, { recursive: true, force: true });
})();
