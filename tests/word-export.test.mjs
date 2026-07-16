import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

test("uses the built-in Word format and exposes preview/export controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const exporter = await readFile(new URL("../lib/word-template.ts", import.meta.url), "utf8");
  const template = await stat(new URL("../public/templates/mountain-plan-template.docx", import.meta.url));

  assert.ok(template.size > 0);
  assert.match(page, /画像の合成とWord生成は、このブラウザ内で完結します/);
  assert.match(page, /Word出力プレビュー/);
  assert.doesNotMatch(page, /補足メモ|参照予定の情報|PLAN BUILD STATUS/);
  assert.doesNotMatch(page, /下書き保存|Markdown保存|templateFile|mountain-plan-draft/);
  assert.match(page, /fetch\("\/templates\/mountain-plan-template\.docx"/);
  assert.match(page, /fillWordTemplate\(await templateResponse\.arrayBuffer\(\), plan,/);
  assert.match(page, /renderAsync\(document, container\.current/);
  assert.match(exporter, /宿泊地URL/);
  assert.match(exporter, /ヤマレコのルート地図を開く/);
  assert.match(exporter, /appendImagesAfterBodyParagraph/);
  assert.match(exporter, /〈時刻表など〉/);
  assert.doesNotMatch(exporter, /fetch\(/);
});
