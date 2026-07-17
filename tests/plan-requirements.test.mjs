import assert from "node:assert/strict";
import iconv from "iconv-lite";
import test from "node:test";

const yamarecoUrl =
  "https://www.yamareco.com/modules/yr_plan/code-Qq6X2KlFRsWyYF6U45ZXCg";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
};
const ctx = { waitUntil() {}, passThroughOnException() {} };

test("rejects non-Yamareco URLs", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/private-plan" }),
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 400);
});

test("blocks personal contact details before generation", async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: yamarecoUrl, notes: "緊急連絡先：090-1234-5678" }),
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /個人情報/);
});

test("returns every public-information section required by the Word sample", async () => {
  const sampleHtml = `
    <html><head><title>パノラマ銀座-2026年07月11日[登山・山行記録]-ヤマレコ</title></head><body>
      <div class="label3">全員に公開</div>
      <div class="label3">無雪期ピークハント／縦走</div>
      <div class="label3">妙高・戸隠・雨飾</div>
      <div class="date">2026年07月18日(土) &#65374; 2026年07月19日(日)</div>
      <div class="pace-num"><span>1.0</span></div>
      <a href="showmap.php?plid=6987624">地図</a>
      <div class="record-detail-content-time-block">
        <div class="day">1日目</div>
        <div class="item" title="トイレ"><div class="time1">11:00</div><div class="name">笹ケ峰登山口</div></div>
        <div class="item"><div class="time1">12:12</div><div class="name">黒沢橋</div></div>
        <div class="item"><span class="icon-water"></span><div class="time1">15:18</div><div class="name">黒沢池ヒュッテ</div></div>
      </div>
      <div class="record-detail-content-time-block">
        <div class="day">2日目</div>
        <div class="item"><div class="time1">04:01</div><div class="name">黒沢池ヒュッテ</div></div>
        <div class="item"><div class="time1">06:33</div><div class="name">妙高山北峰</div></div>
        <div class="item"><div class="time1">07:01</div><div class="name">妙高山南峰</div></div>
        <div class="item"><div class="time1">07:06</div><div class="name">妙高山北峰</div></div>
        <div class="item"><div class="time1">09:01</div><div class="name">黒沢池ヒュッテ</div></div>
        <div class="item"><div class="time1">10:11</div><div class="name">茶臼山</div></div>
        <div class="item"><div class="time1">10:39</div><div class="name">高谷池ヒュッテ</div></div>
        <div class="item"><div class="time1">12:34</div><div class="name">火打山</div></div>
        <div class="item"><div class="time1">14:01</div><div class="name">高谷池ヒュッテ</div></div>
        <div class="item"><div class="time1">16:54</div><div class="name">笹ケ峰登山口</div></div>
      </div>
      </section>
    </body></html>`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const target = typeof input === "string" ? input : input.url;
    if (target === yamarecoUrl) {
      return new Response(iconv.encode(sampleHtml, "euc-jp"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("Not found", { status: 404 });
  };
  const worker = await loadWorker();
  const response = await worker.fetch(new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: yamarecoUrl, notes: "個人情報を含まない補足" }),
  }), env, ctx);
  globalThis.fetch = originalFetch;
  assert.equal(response.status, 200);
  const { plan } = await response.json();
  const stringFields = [
    "title", "dates", "area", "purpose", "meeting", "dismissal", "entryPoint", "entryTime",
    "exitPoint", "exitTime", "summary", "route", "courseTimeMultiplier", "sunset", "sunrise", "weather",
    "transport", "lodging", "emergency", "emergencyEvacuation", "conceptMap", "routeMapUrl",
  ];
  const arrayFields = [
    "schedule", "risks", "waterSources", "foodPlan", "commonEquipment",
    "personalEquipment", "budgetItems", "relatedOrganizations", "timetables", "lodgingLinks", "sources",
  ];
  for (const field of stringFields) assert.equal(typeof plan[field], "string", field);
  for (const field of arrayFields) assert.ok(Array.isArray(plan[field]), field);
  assert.equal(plan.sources[0].url, yamarecoUrl);
  assert.equal(plan.transport, "");
  assert.deepEqual(plan.risks, []);
  assert.deepEqual(plan.waterSources, []);
  assert.deepEqual(plan.foodPlan, []);
  assert.deepEqual(plan.commonEquipment, []);
  assert.deepEqual(plan.personalEquipment, []);
  assert.equal(plan.summary, "");
  assert.equal(plan.weather, "");
  assert.equal(plan.meeting, "");
  assert.equal(plan.dismissal, "");
  assert.doesNotMatch(plan.dates, /&#\d+;/);
  assert.equal(plan.title, "20260718-19 パノラマ銀座 計画書");
  assert.equal(plan.dates, "2026年07月18日(土) ～ 2026年07月19日(日)");
  assert.equal(plan.area, "妙高・戸隠・雨飾");
  assert.ok(plan.schedule.every((line) => !line || /^＜\d+日目 \d+\/\d+\([日月火水木金土]\)＞$/.test(line) || /^(?:起床|就寝)時刻：$/.test(line) || /^\d{2}:\d{2} \S/.test(line)));
  assert.equal(plan.schedule[0], "＜1日目 7/18(土)＞");
  assert.ok(plan.schedule.includes("＜2日目 7/19(日)＞"));
  assert.ok(plan.schedule.includes("11:00 笹ケ峰登山口 🚻"));
  assert.ok(plan.schedule.includes("15:20 黒沢池ヒュッテ 💧"));
  assert.ok(plan.schedule.includes("06:35 妙高山北峰"));
  assert.ok(plan.schedule.includes("12:35 火打山"));
  assert.ok(plan.schedule.includes("16:55 笹ケ峰登山口"));
  assert.ok(plan.schedule.includes("起床時刻："));
  assert.ok(plan.schedule.includes("就寝時刻："));
  assert.equal(plan.entryTime, "7/18(土) 11:00");
  assert.equal(plan.exitTime, "7/19(日) 16:55");
  assert.equal(plan.purpose, "");
  assert.equal(plan.budgetItems.length, 6);
  assert.equal(plan.relatedOrganizations.length, 15);
  assert.equal(plan.relatedOrganizations[0], "現地連絡先｜｜");
  assert.equal(plan.relatedOrganizations.at(-1), "病院｜｜");
  assert.match(plan.budgetItems.at(-1), /＋α/);
  assert.ok(
    plan.routeMapUrl === yamarecoUrl || /showmap\.php\?plid=\d+/.test(plan.routeMapUrl),
    "route map falls back to the public plan when Yamareco blocks metadata fetch",
  );
});

test("falls back to web search instructions when Yamareco has no sunset", async () => {
  const route = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8"));
  assert.match(route, /取得できず（Web検索で補完すること）/);
  assert.match(route, /取得できていなければ、対象日と山域に対応する日の入り時刻/);
  assert.match(route, /非公開設定のため読み取れません/);
  assert.match(route, /yamagoya-mirumiru\.korokoro-dev\.jp/);
  assert.match(route, /緊急時に連絡・避難する可能性がある全ての山小屋/);
});
