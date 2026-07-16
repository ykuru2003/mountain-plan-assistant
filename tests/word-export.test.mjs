import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps the Word template in the browser and exposes preview/export controls", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const exporter = await readFile(new URL("../lib/word-template.ts", import.meta.url), "utf8");

  assert.match(page, /テンプレート、氏名、連絡先はサーバーへ送信しません/);
  assert.match(page, /Word出力プレビュー/);
  assert.doesNotMatch(page, /補足メモ|参照予定の情報|PLAN BUILD STATUS/);
  assert.match(page, /fillWordTemplate\(await templateFile\.arrayBuffer\(\), plan,/);
  assert.match(exporter, /宿泊地URL/);
  assert.match(exporter, /ヤマレコのルート地図を開く/);
  assert.match(exporter, /appendImagesAfterBodyParagraph/);
  assert.match(exporter, /〈時刻表など〉/);
  assert.doesNotMatch(exporter, /fetch\(/);
});
