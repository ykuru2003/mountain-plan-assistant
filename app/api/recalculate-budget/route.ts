import { NextResponse } from "next/server";

const BUDGET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["budgetItems"],
  properties: {
    budgetItems: { type: "array", minItems: 6, maxItems: 6, items: { type: "string" } },
  },
};

function normalizeBudgetLabel(item: string, note: string) {
  const transportDetail = item.match(/^交通費\s*[（(［\[]?\s*(鉄道|電車|JR|バス)\s*[）)\］\]]?$/);
  if (!transportDetail) return { item, note };
  const detail = transportDetail[1] === "電車" ? "鉄道" : transportDetail[1];
  return {
    item: "交通費",
    note: note.includes(detail) ? note : [detail, note].filter(Boolean).join("："),
  };
}

function normalize(values: string[]) {
  return values.slice(0, 6).map((value, index) => {
    const [item = "", rawAmount = "", rawNote = ""] = value.split(/[｜|]/).map((part) => part.trim());
    let amount = /^(?:0|0円|¥0|￥0)$/.test(rawAmount) ? "" : rawAmount;
    const normalized = normalizeBudgetLabel(item, rawNote.replace(/1人分概算/g, "").trim());
    if (/タクシー/.test(`${normalized.item}${normalized.note}`)) amount = "未定";
    if (index === 5 && amount && !/[+＋]α$/.test(amount)) amount = `${amount}＋α`;
    if (index === 5 && !amount) amount = "＋α";
    return `${normalized.item}｜${amount}｜${normalized.note}`;
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { transport?: string; budgetItems?: string[] } | null;
  const transport = body?.transport?.trim().slice(0, 3000) ?? "";
  if (!transport) return NextResponse.json({ error: "交通経路を入力してください。" }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "費用の自動再計算はAPI設定後に利用できます。" }, { status: 503 });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.4",
      store: false,
      tools: [{ type: "web_search" }],
      input: `次の山行交通経路を公式情報で確認し、予算だけを再計算してください。\n\n交通経路:\n${transport}\n\n現在の予算:\n${(body?.budgetItems ?? []).join("\n")}\n\n6行を「項目｜金額｜備考」で返してください。項目名は、交通費、交通費、テント場代、温泉、その他、合計の順に固定し、鉄道・バスの区別は備考へ書いてください。新宿起点の往復。JR片道101km以上は普通運賃を2割引きし10の位で切り捨て、備考に「学割適用」と記載。0円は空欄。タクシーを人数割りする場合は未定。合計末尾は必ず「＋α」。宿泊等の既存費用は変更しない。`,
      text: { format: { type: "json_schema", name: "recalculated_budget", strict: true, schema: BUDGET_SCHEMA } },
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) return NextResponse.json({ error: "交通費を再計算できませんでした。" }, { status: 502 });
  const output = Array.isArray(payload.output) ? payload.output : [];
  const message = output.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "message") as Record<string, unknown> | undefined;
  const content = message && Array.isArray(message.content) ? message.content : [];
  const text = content.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "output_text") as Record<string, unknown> | undefined;
  if (!text || typeof text.text !== "string") return NextResponse.json({ error: "再計算結果を読み取れませんでした。" }, { status: 502 });
  const result = JSON.parse(text.text) as { budgetItems: string[] };
  return NextResponse.json({ budgetItems: normalize(result.budgetItems) });
}
