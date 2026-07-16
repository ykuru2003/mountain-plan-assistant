import { NextResponse } from "next/server";
import iconv from "iconv-lite";

type Source = { title: string; url: string };

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title", "dates", "area", "purpose", "meeting", "dismissal", "entryPoint", "exitPoint",
    "summary", "route", "schedule", "courseTimeMultiplier", "sunset", "weather", "risks",
    "transport", "lodging", "lodgingLinks", "waterSources", "foodPlan", "emergency", "emergencyEvacuation",
    "commonEquipment", "personalEquipment", "budgetItems", "relatedOrganizations",
    "conceptMap", "routeMapUrl", "timetables", "sources",
  ],
  properties: {
    title: { type: "string" },
    dates: { type: "string" },
    area: { type: "string" },
    purpose: { type: "string" },
    meeting: { type: "string" },
    dismissal: { type: "string" },
    entryPoint: { type: "string" },
    exitPoint: { type: "string" },
    summary: { type: "string" },
    route: { type: "string" },
    schedule: { type: "array", items: { type: "string" } },
    courseTimeMultiplier: { type: "string" },
    sunset: { type: "string" },
    weather: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    transport: { type: "string" },
    lodging: { type: "string" },
    lodgingLinks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url"],
        properties: { title: { type: "string" }, url: { type: "string" } },
      },
    },
    waterSources: { type: "array", items: { type: "string" } },
    foodPlan: { type: "array", items: { type: "string" } },
    emergency: { type: "string" },
    emergencyEvacuation: { type: "string" },
    commonEquipment: { type: "array", items: { type: "string" } },
    personalEquipment: { type: "array", items: { type: "string" } },
    budgetItems: { type: "array", items: { type: "string" } },
    relatedOrganizations: { type: "array", items: { type: "string" } },
    conceptMap: { type: "string" },
    routeMapUrl: { type: "string" },
    timetables: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url"],
        properties: { title: { type: "string" }, url: { type: "string" } },
      },
    },
  },
};

function isAllowedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "yamareco.com" || url.hostname.endsWith(".yamareco.com"));
  } catch {
    return false;
  }
}

function containsPersonalData(value: string) {
  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phone = /(?:\+81|0\d{1,4})[-ー−\s]?\d{1,4}[-ー−\s]?\d{3,4}/;
  const labeledPersonalField = /(?:氏名|電話番号|メールアドレス|緊急連絡先)\s*[:：]/;
  return email.test(value) || phone.test(value) || labeledPersonalField.test(value);
}

function decodeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function roundTimesToFiveMinutes(value: string) {
  return value.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (_match, hourText: string, minuteText: string) => {
    const total = Number(hourText) * 60 + Number(minuteText);
    const rounded = Math.round(total / 5) * 5;
    const hour = Math.floor(rounded / 60) % 24;
    const minute = rounded % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  });
}

function stripHtml(value: string) {
  return decodeEntities(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function buildPlanTitle(dates: string, publicTitle?: string | null) {
  const dateParts = [...dates.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日/g)]
    .map((match) => ({ year: match[1], month: match[2].padStart(2, "0"), day: match[3].padStart(2, "0") }));
  const first = dateParts[0];
  const last = dateParts.at(-1);
  const dateLabel = first
    ? `${first.year}${first.month}${first.day}${last && last !== first
      ? (last.year === first.year && last.month === first.month ? `-${last.day}` : `-${last.month}${last.day}`)
      : ""}`
    : "日程未定";
  const sourceName = (publicTitle || "山行")
    .replace(/\s*登山計画書\s*$/u, "")
    .replace(/\s+/g, "")
    .replace(/[‐‑‒–—―ー]/g, "-");
  const routeName = /火打/.test(sourceName) && /妙高/.test(sourceName) ? "火打-妙高" : sourceName;
  return `${dateLabel} ${routeName} 計画書`;
}

type ParsedPublicPlan = {
  dates: string;
  area: string;
  schedule: string[];
  courseTimeMultiplier: string;
  entryPoint: string;
  exitPoint: string;
  lodging: string;
  firstPointId: string;
};

function parsePublicPlanHtml(html: string): ParsedPublicPlan {
  const dates = stripHtml(html.match(/<div class="date">([\s\S]*?)<\/div>/i)?.[1] ?? "");
  const areaLabels = [...html.matchAll(/<div class="label3">([\s\S]*?)<\/div>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
  const area = areaLabels.at(-1) ?? "";
  const courseTimeMultiplier = stripHtml(html.match(/<div class="pace-num">[\s\S]*?<span[^>]*>([^<]+)<\/span>/i)?.[1] ?? "");
  const blockMatches = [...html.matchAll(/<div class="record-detail-content-time-block">/g)];
  const schedule: string[] = [];
  const allPoints: Array<{ name: string; pointId: string }> = [];
  const lodgingNames = new Set<string>();

  for (let blockIndex = 0; blockIndex < blockMatches.length; blockIndex += 1) {
    const start = blockMatches[blockIndex].index ?? 0;
    const end = blockMatches[blockIndex + 1]?.index ?? html.indexOf("</section>", start);
    const block = html.slice(start, end > start ? end : undefined);
    const itemMatches = [...block.matchAll(/<div class="item(?:\s+[^"']*)?">/g)];
    const points: Array<{ time: string; name: string; pointId: string }> = [];
    for (let itemIndex = 0; itemIndex < itemMatches.length; itemIndex += 1) {
      const itemStart = itemMatches[itemIndex].index ?? 0;
      const itemEnd = itemMatches[itemIndex + 1]?.index ?? block.length;
      const item = block.slice(itemStart, itemEnd);
      const time = stripHtml(item.match(/<div class="time1">([^<]+)<\/div>/i)?.[1] ?? "");
      const nameHtml = item.match(/<div class="name">([\s\S]*?)<\/div>/i)?.[1] ?? "";
      const name = stripHtml(nameHtml);
      const pointId = nameHtml.match(/ptid=(\d+)/i)?.[1] ?? "";
      if (time && name) points.push({ time: roundTimesToFiveMinutes(time), name, pointId });
    }
    if (!points.length) continue;
    allPoints.push(...points.map(({ name, pointId }) => ({ name, pointId })));
    const major = points.filter((point, index) => {
      if (index === 0 || index === points.length - 1) return true;
      if (/(?:ヒュッテ|山荘|山小屋|小屋|避難小屋|テント場|キャンプ場)$/.test(point.name)) return true;
      return /(?:山(?:北峰|南峰)?|岳|峰|山頂)$/.test(point.name);
    });
    for (const point of points) {
      if (/(?:ヒュッテ|山荘|山小屋|小屋|避難小屋|テント場|キャンプ場)$/.test(point.name)) lodgingNames.add(point.name);
    }
    if (schedule.length) schedule.push("");
    schedule.push(...major.map((point) => `${point.time} ${point.name}`));
  }

  return {
    dates,
    area,
    schedule,
    courseTimeMultiplier,
    entryPoint: allPoints[0]?.name ?? "",
    exitPoint: allPoints.at(-1)?.name ?? "",
    lodging: [...lodgingNames].join("、"),
    firstPointId: allPoints.find((point) => point.pointId)?.pointId ?? "",
  };
}

async function readSunsetTimes(pointId: string, dates: string) {
  if (!pointId || !dates) return "";
  try {
    const response = await fetch(`https://www.yamareco.com/modules/yamainfo/ptinfo.php?ptid=${pointId}`, {
      headers: { "user-agent": "MountainPlanAssistant/1.0 (+public-plan-reader)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return "";
    const html = iconv.decode(Buffer.from(await response.arrayBuffer()), "euc-jp");
    const targetDates = [...dates.matchAll(/(\d{1,2})月(\d{1,2})日/g)]
      .map((match) => `${String(Number(match[1])).padStart(2, "0")}/${String(Number(match[2])).padStart(2, "0")}`);
    const rows = [...html.matchAll(/<tr>[\s\S]*?<td>(\d{2}\/\d{2})[\s\S]*?<span class="txt_e fs-18">[^<]+<\/span>[\s\S]*?<span class="txt_e fs-18">([^<]+)<\/span>[\s\S]*?<\/tr>/gi)];
    return rows
      .filter((match) => targetDates.includes(match[1]))
      .map((match) => `${match[1]} ${roundTimesToFiveMinutes(match[2])}`)
      .join("、");
  } catch {
    return "";
  }
}

async function readPublicPlanMeta(url: string) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "MountainPlanAssistant/1.0 (+public-plan-reader)" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return { title: null, routeMapUrl: "", parsed: null, sunset: "" };
    const bytes = Buffer.from(await response.arrayBuffer());
    const html = iconv.decode(bytes, "euc-jp");
    const rawTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const title = rawTitle ? decodeEntities(rawTitle)
      .replace(/\s*\[山行計画\]\s*-\s*ヤマレコ\s*$/i, "")
      .trim()
      .slice(0, 100) || null : null;
    const planId = html.match(/showmap\.php\?plid=(\d+)/i)?.[1]
      ?? html.match(/var\s+plid\s*=\s*["']?(\d+)/i)?.[1];
    const routeMapUrl = planId
      ? `https://www.yamareco.com/modules/yr_plan/showmap.php?plid=${planId}&mode=cyberjapan`
      : "";
    const parsed = parsePublicPlanHtml(html);
    const sunset = await readSunsetTimes(parsed.firstPointId, parsed.dates);
    return { title, routeMapUrl, parsed, sunset };
  } catch {
    return { title: null, routeMapUrl: "", parsed: null, sunset: "" };
  }
}

function demoPlan(
  url: string,
  notes: string,
  publicTitle?: string | null,
  routeMapUrl = "",
  parsed: ParsedPublicPlan | null = null,
  sunset = "",
) {
  void notes;
  return {
    title: buildPlanTitle(parsed?.dates || "", publicTitle),
    dates: parsed?.dates || "",
    area: parsed?.area || "",
    purpose: "",
    meeting: "",
    dismissal: "",
    entryPoint: parsed?.entryPoint || "",
    exitPoint: parsed?.exitPoint || "",
    summary: "",
    route: "",
    schedule: parsed?.schedule.length ? parsed.schedule : [],
    courseTimeMultiplier: parsed?.courseTimeMultiplier || "",
    sunset: sunset || "",
    weather: "",
    risks: [],
    transport: "",
    lodging: parsed?.lodging || "",
    lodgingLinks: [],
    waterSources: [],
    foodPlan: [],
    emergency: "",
    emergencyEvacuation: "",
    commonEquipment: [],
    personalEquipment: [],
    budgetItems: [],
    relatedOrganizations: [],
    conceptMap: "",
    routeMapUrl: routeMapUrl || url,
    timetables: [],
    sources: [
      { title: "入力したヤマレコ", url },
      { title: "気象庁 防災情報", url: "https://www.jma.go.jp/bosai/" },
      { title: "国土地理院 地理院地図", url: "https://maps.gsi.go.jp/" },
    ],
  };
}

function collectSources(payload: Record<string, unknown>, originalUrl: string): Source[] {
  const sources = new Map<string, Source>();
  sources.set(originalUrl, { title: "入力したヤマレコ", url: originalUrl });
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const action = record.action && typeof record.action === "object" ? record.action as Record<string, unknown> : null;
    const actionSources = action && Array.isArray(action.sources) ? action.sources : [];
    for (const source of actionSources) {
      if (!source || typeof source !== "object") continue;
      const candidate = source as Record<string, unknown>;
      if (typeof candidate.url === "string") sources.set(candidate.url, { title: "Web検索結果", url: candidate.url });
    }
    const content = Array.isArray(record.content) ? record.content : [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const annotations = Array.isArray((block as Record<string, unknown>).annotations)
        ? (block as Record<string, unknown>).annotations as Array<Record<string, unknown>> : [];
      for (const annotation of annotations) {
        if (typeof annotation.url === "string") {
          sources.set(annotation.url, { title: typeof annotation.title === "string" ? annotation.title : "参照情報", url: annotation.url });
        }
      }
    }
  }
  return [...sources.values()];
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { url?: string; notes?: string } | null;
  const url = body?.url?.trim() ?? "";
  const notes = body?.notes?.trim().slice(0, 400) ?? "";
  if (!isAllowedUrl(url)) return NextResponse.json({ error: "有効なヤマレコ公開URLを入力してください。" }, { status: 400 });
  if (containsPersonalData(notes)) {
    return NextResponse.json({ error: "補足メモに個人情報が含まれている可能性があります。氏名・電話番号・メールアドレスを削除してください。" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const publicMeta = await readPublicPlanMeta(url);
  const publicTitle = publicMeta.title;
  if (!apiKey) {
    return NextResponse.json({
      plan: demoPlan(url, notes, publicTitle, publicMeta.routeMapUrl, publicMeta.parsed, publicMeta.sunset),
      demoMode: true,
      warning: publicTitle
        ? `公開ページ「${publicTitle}」を読み込みました。Web検索は未設定のため、交通・宿泊の詳細を確認してください。`
        : "Web検索は未設定です。ヤマレコURLと各項目を確認してください。",
    });
  }

  const prompt = `あなたは大学ワンダーフォーゲル部の泊まり山行計画書を作るアシスタントです。次の公開ヤマレコURLを開き、指定どおり整理してください。\n\nURL: ${url}\n取得済みページ名: ${publicTitle || "取得できず"}\n取得済みルート地図URL: ${publicMeta.routeMapUrl || "取得できず"}\n補足メモ: ${notes || "なし"}\n\nヤマレコから転記する項目:\n- 日程、山域、目的、入山地点、下山地点はヤマレコの記載だけを使う。\n- meetingとdismissalは手動記入欄なので必ず空文字にする。\n- scheduleは1地点につき1項目とし、各項目を「時刻 地点」の形式にする。矢印、日付、日目の見出しは付けず、日が変わる位置だけ空文字を1項目入れる。\n- 地点は次の主要地点だけを残す: ①水場またはトイレがある地点、②山頂または小屋。登山口・下山口は各日の始点・終点として残してよい。それ以外の分岐・峠・通過点は省く。\n- schedule内の時刻はすべて5分単位に四捨五入する（例 08:02→08:00、08:03→08:05）。\n- courseTimeMultiplierはヤマレコに表示された倍率を転記する。推測しない。\n- sunsetはヤマレコ記載の日の入り時刻のみ。参照元名やURLは付けない。\n- lodgingはヤマレコ記載のテント場・山小屋を起点にする。\n- routeMapUrlは取得済みルート地図URLを使い、conceptMapは「ヤマレコのルート地図スクリーンショット」とする。\n\nWeb検索で補完する項目:\n- transportとtimetablesは新宿駅から登山口までの往復として、公式の鉄道・バス時刻表で調べる。\n- budgetItemsも新宿駅起点の往復。JRの片道営業キロが101km以上なら普通運賃を2割引きし、10の位で切り捨て、「学割適用」と明記する。特急料金など割引対象外は分けて記載する。\n- lodgingには各テント場・山小屋について、予約要否、料金、水場が有料か無料か、煮沸が必要かを公式情報で記載する。lodgingLinksには宿泊地名をtitle、公式URLをurlとして入れる。\n- relatedOrganizationsは名称・公開連絡先を記載する。\n\n記載しない項目:\n- summaryとrouteとweatherとmeetingとdismissalとemergencyとemergencyEvacuationは空文字。\n- risks、waterSources、foodPlan、commonEquipment、personalEquipmentは空配列。これらはWord上で人が手動記入する。\n\n制約:\n- 個人情報は生成しない。氏名、個人の電話番号・メールアドレスを推測しない。\n- 公式機関、交通事業者、自治体、山小屋など一次情報を優先する。\n- 日付依存情報には対象日または確認日を明記する。\n- budgetItemsは「項目｜金額｜備考」、relatedOrganizationsは「名称｜連絡先｜用途」の形式にする。\n- sourcesには実際に参照したURLと分かりやすいタイトルを入れる。\n- 手動記入が必要な内容に「要確認」「追記してください」などの案内文を入れず、空欄にする。\n- 日本語で簡潔に記載する。`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5.6",
      store: false,
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      input: prompt,
      text: { format: { type: "json_schema", name: "mountain_plan", strict: true, schema: PLAN_SCHEMA } },
    }),
  });

  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const message = payload.error && typeof payload.error === "object" && typeof (payload.error as Record<string, unknown>).message === "string"
      ? (payload.error as Record<string, unknown>).message as string : "公開情報を整理できませんでした。";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const message = output.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "message") as Record<string, unknown> | undefined;
  const content = message && Array.isArray(message.content) ? message.content : [];
  const textBlock = content.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "output_text") as Record<string, unknown> | undefined;
  if (!textBlock || typeof textBlock.text !== "string") return NextResponse.json({ error: "公開情報の整理結果を読み取れませんでした。" }, { status: 502 });

  const plan = JSON.parse(textBlock.text) as ReturnType<typeof demoPlan>;
  plan.routeMapUrl = publicMeta.routeMapUrl || plan.routeMapUrl;
  plan.schedule = plan.schedule.map(roundTimesToFiveMinutes);
  if (publicMeta.parsed) {
    plan.dates = publicMeta.parsed.dates || plan.dates;
    plan.area = publicMeta.parsed.area || plan.area;
    plan.entryPoint = publicMeta.parsed.entryPoint || plan.entryPoint;
    plan.exitPoint = publicMeta.parsed.exitPoint || plan.exitPoint;
    plan.courseTimeMultiplier = publicMeta.parsed.courseTimeMultiplier || plan.courseTimeMultiplier;
    plan.schedule = publicMeta.parsed.schedule.length ? publicMeta.parsed.schedule : plan.schedule;
  }
  plan.sunset = publicMeta.sunset || plan.sunset;
  plan.title = buildPlanTitle(plan.dates, publicTitle || plan.title);
  plan.summary = "";
  plan.route = "";
  plan.weather = "";
  plan.meeting = "";
  plan.dismissal = "";
  plan.risks = [];
  plan.waterSources = [];
  plan.foodPlan = [];
  plan.emergency = "";
  plan.emergencyEvacuation = "";
  plan.commonEquipment = [];
  plan.personalEquipment = [];
  const gatheredSources = collectSources(payload, url);
  const sources = new Map<string, Source>();
  for (const source of [...plan.sources, ...plan.lodgingLinks, ...gatheredSources]) {
    try { new URL(source.url); sources.set(source.url, source); } catch { /* ignore invalid source URLs */ }
  }
  return NextResponse.json({ plan: { ...plan, sources: [...sources.values()] } });
}
