import assert from "node:assert/strict";
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
  const worker = await loadWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: yamarecoUrl, notes: "個人情報を含まない補足" }),
    }),
    env,
    ctx,
  );
  assert.equal(response.status, 200);
  const { plan } = await response.json();
  const stringFields = [
    "title", "dates", "area", "purpose", "meeting", "dismissal", "entryPoint",
    "exitPoint", "summary", "route", "courseTimeMultiplier", "sunset", "weather",
    "transport", "lodging", "emergency", "emergencyEvacuation", "conceptMap", "routeMapUrl",
  ];
  const arrayFields = [
    "schedule", "risks", "waterSources", "foodPlan", "commonEquipment",
    "personalEquipment", "budgetItems", "relatedOrganizations", "timetables", "lodgingLinks", "sources",
  ];
  for (const field of stringFields) assert.equal(typeof plan[field], "string", field);
  for (const field of arrayFields) assert.ok(Array.isArray(plan[field]), field);
  assert.equal(plan.sources[0].url, yamarecoUrl);
  assert.match(plan.transport, /新宿/);
  assert.deepEqual(plan.risks, []);
  assert.deepEqual(plan.waterSources, []);
  assert.deepEqual(plan.foodPlan, []);
  assert.deepEqual(plan.commonEquipment, []);
  assert.deepEqual(plan.personalEquipment, []);
  assert.equal(plan.summary, "");
  assert.equal(plan.weather, "");
  if (/2026年0?7月18日/.test(plan.dates)) {
    assert.equal(plan.title, "20260718-19 火打-妙高 計画書");
  }
  assert.match(plan.budgetItems[0], /新宿/);
  assert.ok(
    plan.routeMapUrl === yamarecoUrl || /showmap\.php\?plid=\d+/.test(plan.routeMapUrl),
    "route map falls back to the public plan when Yamareco blocks metadata fetch",
  );
});
