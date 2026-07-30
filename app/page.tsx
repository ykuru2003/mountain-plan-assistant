"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  MapPinned,
  Maximize2,
  Minus,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Route,
  Upload,
  X,
} from "lucide-react";
import { type ClipboardEvent, type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { fillWordTemplate, type WordImage } from "@/lib/word-template";

type Source = { title: string; url: string };
type Plan = {
  title: string;
  dates: string;
  area: string;
  purpose: string;
  meeting: string;
  dismissal: string;
  entryPoint: string;
  entryTime: string;
  exitPoint: string;
  exitTime: string;
  summary: string;
  route: string;
  schedule: string[];
  courseTimeMultiplier: string;
  sunset: string;
  sunrise: string;
  weather: string;
  risks: string[];
  transport: string;
  lodging: string;
  lodgingLinks: Source[];
  waterSources: string[];
  foodPlan: string[];
  emergency: string;
  emergencyEvacuation: string;
  commonEquipment: string[];
  personalEquipment: string[];
  budgetItems: string[];
  relatedOrganizations: string[];
  conceptMap: string;
  routeMapUrl: string;
  timetables: string[];
  sources: Source[];
};

type GenerateResponse = {
  plan: Plan;
  demoMode?: boolean;
  warning?: string;
  generatedImages?: {
    routeMap?: {
      contentType: string;
      bytesBase64: string;
      filename?: string;
    };
    timetables?: Array<{
      contentType: string;
      bytesBase64: string;
      filename?: string;
    }>;
  };
};

type UsageHistoryItem = {
  url: string;
  title: string;
  usedAt: string;
};

const USAGE_HISTORY_KEY = "yamareco-research-history";
const MAX_USAGE_HISTORY = 12;
const TEMPORARY_OPEN_REVIEW_WITHOUT_RETRIEVAL = true;

const EMPTY_PLAN: Plan = {
  title: "",
  dates: "",
  area: "",
  purpose: "",
  meeting: "",
  dismissal: "",
  entryPoint: "",
  entryTime: "",
  exitPoint: "",
  exitTime: "",
  summary: "",
  route: "",
  schedule: [],
  courseTimeMultiplier: "",
  sunset: "",
  sunrise: "",
  weather: "",
  risks: [],
  transport: "",
  lodging: "",
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
  routeMapUrl: "",
  timetables: [],
  sources: [],
};

const ARRAY_FIELDS: Array<keyof Plan> = [
  "schedule", "risks", "waterSources", "foodPlan", "commonEquipment",
  "personalEquipment", "budgetItems", "relatedOrganizations", "timetables", "lodgingLinks", "sources",
];

const BUDGET_DEFAULTS = [
  "交通費｜｜鉄道（新宿から往復）",
  "交通費｜｜バス（駅から登山口まで往復）",
  "テント場代｜｜",
  "温泉｜｜",
  "その他｜｜食費など",
  "合計｜＋α｜",
];

const AGENCY_SCHEMA = [
  { type: "現地連絡先", count: 1 },
  { type: "顧問", count: 1 },
  { type: "大学", count: 1 },
  { type: "コーチ", count: 6 },
  { type: "主将", count: 1 },
  { type: "バス", count: 1 },
  { type: "タクシー", count: 1 },
  { type: "警察", count: 1 },
  { type: "山小屋", count: 1 },
  { type: "病院", count: 1 },
];
function inferAgencyType(value: string) {
  const [rawType = ""] = value.split(/[｜|]/).map((part) => part.trim());
  if (AGENCY_SCHEMA.some(({ type }) => type === rawType)) return rawType;
  if (/警察/.test(value)) return "警察";
  if (/病院|医療/.test(value)) return "病院";
  if (/山小屋|ヒュッテ|山荘/.test(value)) return "山小屋";
  if (/タクシー/.test(value)) return "タクシー";
  if (/バス/.test(value)) return "バス";
  if (/コーチ/.test(value)) return "コーチ";
  if (/主将/.test(value)) return "主将";
  if (/大学/.test(value)) return "大学";
  if (/顧問/.test(value)) return "顧問";
  if (/現地連絡先/.test(value)) return "現地連絡先";
  return "";
}

function normalizeAgencyContact(rawContact: string) {
  const contact = rawContact.trim();
  if (!contact) return "TEL: ";
  if (/\d/.test(contact)) return `TEL: ${contact.replace(/^TEL\s*[:：]\s*/i, "")}`;
  return contact;
}

function normalizeAgencyRows(values: string[]) {
  const buckets = new Map(AGENCY_SCHEMA.map(({ type }) => [type, [] as string[]]));
  let currentType = "";
  for (const value of values) {
    const [rawType = "", rawName = "", rawContact = ""] = value.split(/[｜|]/).map((part) => part.trim());
    const inferred = inferAgencyType(value) || currentType;
    if (!inferred || !buckets.has(inferred)) continue;
    currentType = inferred;
    const exact = rawType === inferred;
    const name = exact || !rawType ? rawName : rawType;
    const contact = normalizeAgencyContact(rawContact || (!exact && rawName && /\d/.test(rawName) ? rawName : ""));
    buckets.get(inferred)?.push(`${inferred}｜${name}｜${contact}`);
  }
  const rows = AGENCY_SCHEMA.flatMap(({ type, count }) => {
    const bucketRows = buckets.get(type) ?? [];
    const defaults = Array.from({ length: Math.max(count, bucketRows.length) }, (_, index) =>
      bucketRows[index] ?? `${type}｜｜TEL: `,
    );
    return defaults;
  });
  return collapseDuplicateAgencyLabels(rows);
}

function collapseDuplicateAgencyLabels(values: string[]) {
  const seen = new Set<string>();
  return values.map((value) => {
    const [item = "", name = "", contact = ""] = value.split(/[｜|]/).map((part) => part.trim());
    if (!item || !seen.has(item)) {
      if (item) seen.add(item);
      return `${item}｜${name}｜${contact}`;
    }
    return `｜${name}｜${contact}`;
  });
}

function normalizeBudgetLabel(item: string, note: string) {
  const transportDetail = item.match(/^交通費\s*[（(［\[]?\s*(鉄道|電車|JR|バス)\s*[）)\］\]]?$/);
  if (!transportDetail) return { item, note };
  const detail = transportDetail[1] === "電車" ? "鉄道" : transportDetail[1];
  return {
    item: "交通費",
    note: note.includes(detail) ? note : [detail, note].filter(Boolean).join("："),
  };
}

function normalizeBudgetRows(values: string[]) {
  const rows = values.length ? values.slice(0, 6) : [...BUDGET_DEFAULTS];
  while (rows.length < 6) rows.push(BUDGET_DEFAULTS[rows.length]);
  return rows.map((row, index) => {
    const [item = "", rawAmount = "", rawNote = ""] = row.split(/[｜|]/).map((part) => part.trim());
    let amount = /^(?:0|0円|¥0|￥0)$/.test(rawAmount) ? "" : rawAmount;
    const normalized = normalizeBudgetLabel(item, rawNote.replace(/1人分概算/g, "").trim());
    if (/タクシー/.test(`${normalized.item}${normalized.note}`)) amount = "未定";
    if (index === 5 && amount && !/[+＋]α$/.test(amount)) amount = `${amount}＋α`;
    if (index === 5 && !amount) amount = "＋α";
    return `${normalized.item || BUDGET_DEFAULTS[index].split("｜")[0]}｜${amount}｜${normalized.note}`;
  });
}

function normalizePlan(value: (Partial<Plan> & { access?: string; equipment?: string[] }) | null | undefined): Plan {
  const legacy = value ?? {};
  const merged = { ...EMPTY_PLAN, ...legacy } as Plan;
  if (!merged.transport && legacy.access) merged.transport = legacy.access;
  if (merged.personalEquipment.length === 0 && Array.isArray(legacy.equipment)) {
    merged.personalEquipment = legacy.equipment;
  }
  for (const key of ARRAY_FIELDS) {
    if (!Array.isArray(merged[key])) (merged as Record<string, unknown>)[key] = [];
  }
  merged.budgetItems = normalizeBudgetRows(merged.budgetItems);
  merged.relatedOrganizations = normalizeAgencyRows(merged.relatedOrganizations);
  merged.transport = merged.transport.replace(/\s*(復路\s*[:：])/g, "\n$1").trim();
  return merged;
}

function yamarecoPlanUrl(sources: Source[]) {
  return sources.find((source) => {
    try {
      const url = new URL(source.url);
      return /ヤマレコ/.test(source.title) && (url.hostname === "yamareco.com" || url.hostname.endsWith(".yamareco.com"));
    } catch {
      return false;
    }
  })?.url ?? "";
}

function extractHttpsUrls(value: string) {
  return [...value.matchAll(/https:\/\/[^\s｜|、）)]+/g)].map((match) => match[0]);
}

const YAMARECO_REFERENCE_WIDTH = 1100;
const WEB_ORGANIZATION_TYPES = new Set(["バス", "タクシー", "警察", "山小屋", "病院"]);

function pipeCells(row: string, count: number) {
  const cells = row.split(/[｜|]/).map((cell) => cell.trim());
  while (cells.length < count) cells.push("");
  return cells.slice(0, count);
}

function visibleWebOrganizationRows(rows: string[]) {
  let currentType = "";
  const seenTypes = new Set<string>();
  return rows.flatMap((rawRow, index) => {
    const [rawItem = "", name = "", contact = ""] = pipeCells(rawRow, 3);
    if (rawItem) currentType = rawItem;
    if (!WEB_ORGANIZATION_TYPES.has(currentType)) return [];
    const item = rawItem && !seenTypes.has(rawItem) ? rawItem : "";
    if (rawItem) seenTypes.add(rawItem);
    return [{ row: `${item}｜${name}｜${contact}`, index }];
  });
}

function categoryCellSpan(rows: string[], rowIndex: number) {
  const [item = ""] = pipeCells(rows[rowIndex] ?? "", 3);
  const [previous = ""] = pipeCells(rows[rowIndex - 1] ?? "", 3);
  if (!item || previous === item) return 0;
  let span = 1;
  for (let index = rowIndex + 1; index < rows.length; index += 1) {
    const [nextItem = ""] = pipeCells(rows[index] ?? "", 3);
    if (nextItem && nextItem !== item) break;
    span += 1;
  }
  return span;
}

function buildTimetableCitations(rows: unknown) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row, rowIndex) => {
    if (typeof row !== "string") return [];
    const [direction = "", route = ""] = pipeCells(row, 3);
    return extractHttpsUrls(row).map((url, urlIndex) => ({
      direction: direction || `時刻表${rowIndex + 1}`,
      key: `${rowIndex}-${urlIndex}-${url}`,
      label: `${route || "バス時刻表"}（${new URL(url).hostname.replace(/^www\./, "")}）`,
      url,
    }));
  });
}

const PROGRESS_STAGES = [
  { label: "ヤマレコを読み取り中", detail: "日程・ルート・山域を確認" },
  { label: "Web検索中", detail: "交通・宿泊・日の入りを確認" },
  { label: "情報を整理中", detail: "取得した公開情報を確認しやすく整形" },
];

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isYamarecoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "yamareco.com" || url.hostname.endsWith(".yamareco.com"));
  } catch {
    return false;
  }
}

function readUsageHistory() {
  try {
    const raw = window.localStorage.getItem(USAGE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UsageHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === "string" && typeof item.title === "string" && typeof item.usedAt === "string")
      .slice(0, MAX_USAGE_HISTORY);
  } catch {
    return [];
  }
}

function writeUsageHistory(items: UsageHistoryItem[]) {
  try {
    window.localStorage.setItem(USAGE_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_USAGE_HISTORY)));
  } catch {
    // 履歴保存に失敗しても、情報取得の本体は止めない。
  }
}

function upsertUsageHistory(items: UsageHistoryItem[], item: UsageHistoryItem) {
  return [item, ...items.filter((current) => current.url !== item.url)].slice(0, MAX_USAGE_HISTORY);
}

function temporaryReviewPlan(url: string) {
  return normalizePlan({
    title: "手入力用の山行情報",
    sources: [{ title: "入力したヤマレコ", url }],
    routeMapUrl: url,
  });
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"input" | "generating" | "review">("input");
  const [stage, setStage] = useState(0);
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [generationDurationMs, setGenerationDurationMs] = useState(0);
  const [routeMapImage, setRouteMapImage] = useState<File | null>(null);
  const [generatedTimetableImages, setGeneratedTimetableImages] = useState<File[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [usageHistory, setUsageHistory] = useState<UsageHistoryItem[]>([]);

  const validUrl = useMemo(() => isYamarecoUrl(url), [url]);

  useEffect(() => {
    if (status !== "generating") return;
    const startedAt = performance.now();
    const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 200);
    const first = window.setTimeout(() => setStage(1), 1800);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(first);
    };
  }, [status]);

  useEffect(() => {
    setUsageHistory(readUsageHistory());
  }, []);

  async function generatePlan() {
    if (!validUrl) {
      setError("ヤマレコの公開URLを確認してください。");
      return;
    }
    setError("");
    setNotice("");
    setStage(0);
    setElapsedMs(0);
    setGenerationDurationMs(0);
    if (TEMPORARY_OPEN_REVIEW_WITHOUT_RETRIEVAL) {
      const normalized = temporaryReviewPlan(url);
      setPlan(normalized);
      setRouteMapImage(null);
      setGeneratedTimetableImages([]);
      setNotice("一時仕様として、情報取得を待たずに入力画面を開いています。");
      const nextHistory = upsertUsageHistory(usageHistory, {
        url,
        title: normalized.title,
        usedAt: new Date().toISOString(),
      });
      setUsageHistory(nextHistory);
      writeUsageHistory(nextHistory);
      setStatus("review");
      return;
    }
    setStatus("generating");
    const startedAt = performance.now();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as GenerateResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "公開情報を取得できませんでした。");
      setStage(2);
      const normalized = normalizePlan(data.plan);
      setPlan(normalized);
      const imageFile = (image: { bytesBase64: string; contentType: string; filename?: string }, fallbackName: string) => {
        const bytes = Uint8Array.from(atob(image.bytesBase64), (char) => char.charCodeAt(0));
        return new File([bytes], image.filename ?? fallbackName, { type: image.contentType || "image/png" });
      };
      if (data.generatedImages?.routeMap) setRouteMapImage(imageFile(data.generatedImages.routeMap, "route-map.png"));
      setGeneratedTimetableImages((data.generatedImages?.timetables ?? []).map((image, index) => imageFile(image, `timetable-${index + 1}.png`)));
      setNotice(data.warning ?? (data.demoMode ? "Web検索は未設定です。ヤマレコから取得した内容を確認してください。" : ""));
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      const durationMs = performance.now() - startedAt;
      setElapsedMs(durationMs);
      setGenerationDurationMs(durationMs);
      console.info("[YAMARECO RESEARCH] retrieval completed", {
        durationMs: Math.round(durationMs),
        completedAt: new Date().toISOString(),
      });
      const nextHistory = upsertUsageHistory(usageHistory, {
        url,
        title: normalized.title || "名称未設定の山行情報",
        usedAt: new Date().toISOString(),
      });
      setUsageHistory(nextHistory);
      writeUsageHistory(nextHistory);
      setStatus("review");
    } catch (reason) {
      const durationMs = performance.now() - startedAt;
      console.info("[YAMARECO RESEARCH] retrieval failed", {
        durationMs: Math.round(durationMs),
        completedAt: new Date().toISOString(),
      });
      setError(reason instanceof Error ? reason.message : "公開情報を取得できませんでした。");
      setStatus("input");
    }
  }

  function updatePlan<K extends keyof Plan>(key: K, value: Plan[K]) {
    setPlan((current) => ({ ...current, [key]: value }));
  }

  function clearUsageHistory() {
    setUsageHistory([]);
    writeUsageHistory([]);
  }

  const activeStep = status === "review" ? 3 : status === "generating" ? 2 : 1;

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">本文へ移動</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="YAMARECO RESEARCH トップ">
          <span className="brand-mark"><Route size={25} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>YAMARECO RESEARCH</strong></span>
        </a>
      </header>

      <div className="page" id="main-content">
        <ol className="stepper" aria-label="情報取得手順">
          {["URLを入力", "情報を取得", "内容を確認"].map((label, index) => {
            const number = index + 1;
            const complete = number < activeStep;
            return (
              <li className={number === activeStep ? "active" : complete ? "complete" : ""} key={label}>
                <span className="step-number">{complete ? <Check size={18} /> : number}</span>
                <span>{label}</span>
              </li>
            );
          })}
        </ol>

        <div className="privacy-note">
          <ShieldCheck size={20} />
          <span>公開された山行情報のみを参照します。氏名・電話番号などの個人情報は入力しないでください。</span>
        </div>

        {status === "review" ? (
          <ReviewView
            plan={plan}
            notice={notice}
            generationDurationMs={generationDurationMs}
            initialTimetableImages={generatedTimetableImages}
            routeMapImage={routeMapImage}
            onBack={() => setStatus("input")}
            onUpdate={updatePlan}
            onRouteMapImageChange={setRouteMapImage}
          />
        ) : (
          <section className="workspace">
            <article className="card input-card">
              <div className="eyebrow"><Search size={18} />YAMARECO / WEB RESEARCH</div>
              <h1><span>山行情報を</span><br />代わりに取得</h1>
              <p className="lead">ヤマレコとWeb検索で分かる公開情報を集めて、確認しやすく整理します。</p>

              <div className="creation-flow" aria-label="公開情報の取得フロー">
                <div className="flow-card flow-sources">
                  <small>01</small>
                  <strong><Share2 size={21} />ヤマレコのURL</strong>
                </div>
                <span className="flow-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
                <div className="flow-card">
                  <small>02</small>
                  <strong><Share2 size={21} />web検索</strong>
                </div>
                <span className="flow-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
                <div className="flow-card flow-output">
                  <small>03</small>
                  <strong><FileText size={21} />抽出結果を確認</strong>
                </div>
              </div>

              <label htmlFor="yamareco-url">ヤマレコの公開URL</label>
              <div className="url-row">
                <div className={`input-wrap ${url ? (validUrl ? "valid" : "invalid") : ""}`}>
                  <Link2 size={21} />
                  <input
                    aria-describedby="url-status"
                    aria-invalid={url ? !validUrl : undefined}
                    id="yamareco-url"
                    inputMode="url"
                    placeholder="https://www.yamareco.com/modules/..."
                    value={url}
                    onChange={(event) => {
                      const nextUrl = event.target.value.trim();
                      setUrl(nextUrl);
                      if (isYamarecoUrl(nextUrl)) setError("");
                    }}
                  />
                  {url && validUrl ? <CheckCircle2 className="valid-icon" size={20} /> : null}
                  {url && !validUrl ? <button type="button" className="clear-url-button" onClick={() => setUrl("")} aria-label="URLをクリア"><X className="invalid-icon" size={20} /></button> : null}
                </div>
              </div>
              <p className={`helper url-status ${url ? (validUrl ? "valid" : "invalid") : ""}`} id="url-status" aria-live="polite">
                {!url ? "入力すると自動でヤマレコURLを判定します。" : validUrl ? "✓ Verified" : "ヤマレコの公開URLではありません。"}
              </p>

              <section className="usage-history">
                <button
                  aria-expanded={historyOpen}
                  className="history-toggle"
                  onClick={() => setHistoryOpen((open) => !open)}
                  type="button"
                >
                  <Clock3 size={17} />
                  使った履歴
                  <span>{usageHistory.length}件</span>
                </button>
                {historyOpen ? (
                  <div className="history-panel">
                    {usageHistory.length ? (
                      <>
                        <div className="history-panel-head">
                          <strong>最近使ったヤマレコ</strong>
                          <button onClick={clearUsageHistory} type="button">履歴を消去</button>
                        </div>
                        <ul>
                          {usageHistory.map((item) => (
                            <li key={`${item.url}-${item.usedAt}`}>
                              <button
                                onClick={() => {
                                  setUrl(item.url);
                                  setError("");
                                }}
                                type="button"
                              >
                                <strong>{item.title}</strong>
                                <span>{new Date(item.usedAt).toLocaleString("ja-JP")}</span>
                                <small>{item.url}</small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : (
                      <p>取得に成功したヤマレコURLがここに残ります。</p>
                    )}
                  </div>
                ) : null}
              </section>

              {error ? <div className="error-message" role="alert">{error}</div> : null}

              <button className="primary-button" disabled={status === "generating"} onClick={generatePlan} type="button">
                {status === "generating" ? <LoaderCircle className="spin" size={23} /> : <Route size={23} />}
                {status === "generating" ? "公開情報を取得中" : "公開情報を取得"}
              </button>
              {status === "generating" ? (
                <div className="generation-progress" aria-live="polite" role="status">
                  <div className="generation-progress-head">
                    <span>{PROGRESS_STAGES[stage].label}</span>
                    <time><Clock3 size={16} />{formatElapsed(elapsedMs)}</time>
                  </div>
                  <div className="generation-progress-track" aria-label="作成進捗">
                    <span style={{ width: `${stage === 0 ? Math.min(28, 8 + elapsedMs / 100) : stage === 1 ? Math.min(88, 36 + elapsedMs / 650) : 96}%` }} />
                  </div>
                  <ol className="generation-stage-list">
                    {PROGRESS_STAGES.map((item, index) => (
                      <li className={index < stage ? "complete" : index === stage ? "active" : ""} key={item.label}>
                        <span>{index < stage ? <Check size={14} /> : index + 1}</span>
                        <div><strong>{item.label.replace("中", "")}</strong><small>{item.detail}</small></div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </article>

          </section>
        )}

      </div>
      <footer className="app-footer">
        <div>
          <strong>🏔️ Research Desk</strong>
          <p>ヤマレコやWeb検索で分かる山行情報を代わりに取得し、確認しやすい形に整理します。</p>
        </div>
        <div>
          <strong>⚡ 高速処理</strong>
          <p>公開ページの解析とWeb検索を組み合わせ、交通・宿泊・予算・連絡先などの調査を短時間でまとめます。</p>
        </div>
        <div>
          <strong>🔒 プライベート</strong>
          <p>公開されたヤマレコ情報のみを参照。個人情報や非公開計画には対応していません。</p>
        </div>
      </footer>
    </main>
  );
}

function ReviewView({
  plan,
  notice,
  generationDurationMs,
  initialTimetableImages,
  routeMapImage,
  onBack,
  onUpdate,
  onRouteMapImageChange,
}: {
  plan: Plan;
  notice: string;
  generationDurationMs: number;
  initialTimetableImages: File[];
  routeMapImage: File | null;
  onBack: () => void;
  onUpdate: <K extends keyof Plan>(key: K, value: Plan[K]) => void;
  onRouteMapImageChange: (file: File | null) => void;
}) {
  const [wordError, setWordError] = useState("");
  const [wordBusy, setWordBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Uint8Array | null>(null);
  const [timetableImages, setTimetableImages] = useState<File[]>(initialTimetableImages);
  const [budgetRecalculating, setBudgetRecalculating] = useState(false);
  const [yamarecoPaneOpen, setYamarecoPaneOpen] = useState(true);
  const [yamarecoFrameSize, setYamarecoFrameSize] = useState({ scale: 1, height: 1200 });
  const transportRecalculation = useRef<number | null>(null);
  const yamarecoFrameRef = useRef<HTMLDivElement | null>(null);
  const listValue = (value: string[]) => value.join("\n");
  const toList = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
  const toScheduleList = (value: string) => value
    .split("\n")
    .map((item) => item.trim())
    .slice(value.startsWith("\n") ? 1 : 0, value.endsWith("\n") ? -1 : undefined);
  const requiredFields: Array<{ label: string; value: string | unknown[] }> = [
    { label: "計画名", value: plan.title }, { label: "日程", value: plan.dates },
    { label: "山域", value: plan.area },
    { label: "集合", value: plan.meeting }, { label: "解散", value: plan.dismissal },
    { label: "入山地点", value: plan.entryPoint }, { label: "下山地点", value: plan.exitPoint },
    { label: "入山時刻", value: plan.entryTime }, { label: "下山時刻", value: plan.exitTime },
    { label: "日別行程", value: plan.schedule }, { label: "交通", value: plan.transport },
    { label: "宿泊", value: plan.lodging }, { label: "コースタイム倍率", value: plan.courseTimeMultiplier },
    { label: "日の入り", value: plan.sunset },
  ];
  const scheduleDayCount = plan.schedule.filter((line) => /^＜\d+日目/.test(line)).length;
  if (scheduleDayCount > 1) requiredFields.push({ label: "日の出", value: plan.sunrise });
  const missingFields = requiredFields.filter(({ value }) => Array.isArray(value) ? value.length === 0 : value.trim().length === 0);
  const completed = requiredFields.length - missingFields.length;
  const completion = Math.round((completed / requiredFields.length) * 100);
  const displayedOrganizations = visibleWebOrganizationRows(plan.relatedOrganizations);
  const displayedOrganizationRows = displayedOrganizations.map((item) => item.row);
  const planUrl = yamarecoPlanUrl(plan.sources);
  const timetableCitationLinks = buildTimetableCitations(plan.timetables);

  useEffect(() => () => {
    if (transportRecalculation.current) window.clearTimeout(transportRecalculation.current);
  }, []);

  useEffect(() => {
    const frame = yamarecoFrameRef.current;
    if (!frame || !planUrl || !yamarecoPaneOpen) return;
    const updateFrameSize = () => {
      const { width, height } = frame.getBoundingClientRect();
      const scale = Math.min(1, Math.max(0.3, width / YAMARECO_REFERENCE_WIDTH));
      setYamarecoFrameSize({
        scale,
        height: Math.max(1200, Math.ceil(height / scale)),
      });
    };
    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [planUrl, yamarecoPaneOpen]);

  function updateTransport(value: string) {
    onUpdate("transport", value);
    if (transportRecalculation.current) window.clearTimeout(transportRecalculation.current);
    transportRecalculation.current = window.setTimeout(async () => {
      if (!value.trim()) return;
      setBudgetRecalculating(true);
      try {
        const response = await fetch("/api/recalculate-budget", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ transport: value, budgetItems: plan.budgetItems }),
        });
        const data = await response.json() as { budgetItems?: string[] };
        if (response.ok && data.budgetItems) onUpdate("budgetItems", normalizeBudgetRows(data.budgetItems));
      } finally {
        setBudgetRecalculating(false);
      }
    }, 1400);
  }

  function updateBudgetCell(rowIndex: number, columnIndex: number, value: string) {
    const nextRows = [...plan.budgetItems];
    const cells = pipeCells(nextRows[rowIndex] ?? "", 3);
    cells[columnIndex] = value.replace(/[｜|]/g, " ");
    nextRows[rowIndex] = cells.join("｜");
    onUpdate("budgetItems", normalizeBudgetRows(nextRows));
  }

  function updateOrganizationCell(rowIndex: number, columnIndex: number, value: string) {
    const nextRows = [...plan.relatedOrganizations];
    const cells = pipeCells(nextRows[rowIndex] ?? "", 3);
    cells[columnIndex] = value.replace(/[｜|]/g, " ");
    nextRows[rowIndex] = cells.join("｜");
    onUpdate("relatedOrganizations", nextRows);
  }

  async function buildWordDocument() {
    const toWordImage = async (file: File): Promise<WordImage> => ({
      bytes: new Uint8Array(await file.arrayBuffer()),
      extension: file.type === "image/png" ? "png" : "jpg",
      contentType: file.type === "image/png" ? "image/png" : "image/jpeg",
    });
    const templateResponse = await fetch("/templates/mountain-plan-template.docx", { cache: "force-cache" });
    if (!templateResponse.ok) throw new Error("内蔵のWord書式を読み込めませんでした。");
    return fillWordTemplate(await templateResponse.arrayBuffer(), plan, {
      routeMap: routeMapImage ? await toWordImage(routeMapImage) : undefined,
      timetables: await Promise.all(timetableImages.map(toWordImage)),
    });
  }

  async function previewWord() {
    setPreviewBusy(true);
    setWordError("");
    try {
      setPreviewDocument(await buildWordDocument());
    } catch (reason) {
      setWordError(reason instanceof Error ? reason.message : "Wordプレビューを作成できませんでした。");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function downloadWord() {
    setWordBusy(true);
    setWordError("");
    try {
      const output = await buildWordDocument();
      const blob = new Blob([new Uint8Array(output).buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = `${plan.title || "登山計画書"}.docx`;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    } catch (reason) {
      setWordError(reason instanceof Error ? reason.message : "Wordファイルを作成できませんでした。");
    } finally {
      setWordBusy(false);
    }
  }

  return (
    <section className={`review-layout ${yamarecoPaneOpen && planUrl ? "with-yamareco-pane" : ""}`}>
      <div className="review-toolbar">
        <button className="text-button" onClick={onBack} type="button"><ArrowLeft size={18} />入力へ戻る</button>
        <div className="review-toolbar-title"><small>編集中の抽出情報</small><strong>{plan.title || "名称未設定の山行情報"}</strong>{generationDurationMs > 0 ? <span className="generation-result"><Clock3 size={13} />取得時間 {formatElapsed(generationDurationMs)}</span> : null}</div>
        <div className="review-toolbar-actions">
          {planUrl ? <button className="outline-button" onClick={() => setYamarecoPaneOpen((open) => !open)} type="button">{yamarecoPaneOpen ? "ヤマレコを閉じる" : "ヤマレコを表示"}</button> : null}
          <button className="outline-button" disabled={previewBusy} onClick={previewWord} type="button"><Eye size={17} />{previewBusy ? "作成中" : "Wordプレビュー"}</button>
          <button className="primary-small" disabled={wordBusy} onClick={downloadWord} type="button"><Download size={17} />{wordBusy ? "作成中" : "Word出力"}</button>
        </div>
      </div>
      {wordError ? <div className="word-error word-error-banner" role="alert">{wordError}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}
      {planUrl && yamarecoPaneOpen ? (
        <aside className="yamareco-reference-pane" aria-label="入力したヤマレコ">
          <div className="yamareco-reference-toolbar">
            <strong>入力したヤマレコ</strong>
            <div>
              <a href={planUrl} rel="noreferrer" target="_blank">別タブで開く<ExternalLink size={12} /></a>
              <button onClick={() => setYamarecoPaneOpen(false)} type="button">折りたたむ</button>
            </div>
          </div>
          <div
            className="yamareco-reference-frame"
            ref={yamarecoFrameRef}
            style={{ "--yamareco-scale": yamarecoFrameSize.scale } as CSSProperties}
          >
            <iframe
              src={planUrl}
              style={{ width: YAMARECO_REFERENCE_WIDTH, height: yamarecoFrameSize.height }}
              title="入力したヤマレコ"
            />
          </div>
          <p>表示されない場合は、上の「別タブで開く」から確認してください。</p>
        </aside>
      ) : null}
      <article className="plan-editor extraction-editor">
        <div className="editor-heading">
          <span>AI抽出結果の確認</span>
        </div>

        <div className="completion-card">
          <div>
            <FileText size={24} />
            <span><strong>抽出項目 {completion}%</strong><small>{missingFields.length ? `未入力：${missingFields.map(({ label }) => label).join("、")}` : "公開情報の抽出項目が揃っています。"}</small></span>
          </div>
          <progress max="100" value={completion}>{completion}%</progress>
        </div>

        <nav className="section-nav" aria-label="編集セクション">
          <a href="#basic"><span>01</span>基本情報</a>
          <a href="#route"><span>02</span>行程</a>
          <a href="#web"><span>03</span>Web検索</a>
          <a href="#tables"><span>04</span>予算・連絡先</a>
          <a href="#images"><span>05</span>画像</a>
        </nav>

        <section className="editor-section" id="basic">
          <div className="section-title"><span>01</span><div><h2>ヤマレコから抽出</h2><p>計画名、日程、山域、入下山地点など、ヤマレコ本文から拾った情報です。</p></div></div>
          <div className="editor-grid">
            <label>計画名<i className="source-badge yamareco">YAMARECO</i><input aria-invalid={!plan.title} value={plan.title} onChange={(event) => onUpdate("title", event.target.value)} /></label>
            <label>日程<i className="source-badge yamareco">YAMARECO</i><input aria-invalid={!plan.dates} value={plan.dates} onChange={(event) => onUpdate("dates", event.target.value)} /></label>
            <label>山域<i className="source-badge yamareco">YAMARECO</i><input aria-invalid={!plan.area} value={plan.area} onChange={(event) => onUpdate("area", event.target.value)} /></label>
            <label>コースタイム倍率<i className="source-badge yamareco">YAMARECO</i><input value={plan.courseTimeMultiplier} onChange={(event) => onUpdate("courseTimeMultiplier", event.target.value)} /></label>
            <label>入山地点<i className="source-badge yamareco">YAMARECO</i><input aria-invalid={!plan.entryPoint} value={plan.entryPoint} onChange={(event) => onUpdate("entryPoint", event.target.value)} /></label>
            <label>入山時刻<i className="source-badge yamareco">YAMARECO</i><input aria-invalid={!plan.entryTime} value={plan.entryTime} onChange={(event) => onUpdate("entryTime", event.target.value)} /></label>
            <label>下山地点<i className="source-badge yamareco">YAMARECO</i><input aria-invalid={!plan.exitPoint} value={plan.exitPoint} onChange={(event) => onUpdate("exitPoint", event.target.value)} /></label>
            <label>下山時刻<i className="source-badge yamareco">YAMARECO</i><input aria-invalid={!plan.exitTime} value={plan.exitTime} onChange={(event) => onUpdate("exitTime", event.target.value)} /></label>
          </div>
          <div className="editor-grid">
            <label className="manual-field">集合<i className="source-badge manual">MANUAL</i><input value={plan.meeting} onChange={(event) => onUpdate("meeting", event.target.value)} /></label>
            <label className="manual-field">解散<i className="source-badge manual">MANUAL</i><input value={plan.dismissal} onChange={(event) => onUpdate("dismissal", event.target.value)} /></label>
          </div>
        </section>

        <section className="editor-section" id="route">
          <div className="section-title"><span>02</span><div><h2>日別行程</h2><p>水場は 💧、トイレは 🚻 を付けて抽出しています。起床・就寝はWord用の手動時刻として残します。</p></div></div>
          <label className="schedule-field">行動予定<i className="source-badge yamareco">YAMARECO</i><textarea aria-invalid={!plan.schedule.length} value={listValue(plan.schedule)} onChange={(event) => onUpdate("schedule", toScheduleList(event.target.value))} /></label>
          <div className="editor-grid">
            <label>初日の日の入り<i className="source-badge hybrid">AI/Web</i><input value={plan.sunset} onChange={(event) => onUpdate("sunset", event.target.value)} /></label>
            {scheduleDayCount > 1 ? <label>日の出<i className="source-badge hybrid">AI/Web</i><input value={plan.sunrise} onChange={(event) => onUpdate("sunrise", event.target.value)} /></label> : null}
          </div>
        </section>

        <section className="editor-section" id="web">
          <div className="section-title"><span>03</span><div><h2>Web検索で補完</h2><p>交通、宿泊、時刻表など、ヤマレコだけでは足りない公開情報です。</p></div></div>
          <label>交通<i className="source-badge web">WEB</i><textarea aria-invalid={!plan.transport} value={plan.transport} onChange={(event) => updateTransport(event.target.value)} /></label>
          {budgetRecalculating ? <p className="inline-status"><LoaderCircle className="spin" size={14} />変更した交通経路から費用を再計算中</p> : null}
          <a className="reference-tool-link" href="https://www.navitime.co.jp/transfer/" rel="noreferrer" target="_blank">NAVITIMEで確認<ExternalLink size={12} /></a>
          <label>宿泊・山小屋<i className="source-badge web">WEB</i><textarea aria-invalid={!plan.lodging} value={plan.lodging} onChange={(event) => onUpdate("lodging", event.target.value)} /></label>
          <a className="reference-tool-link" href="https://yamagoya-mirumiru.korokoro-dev.jp/" rel="noreferrer" target="_blank">山小屋みるみるで予約状況を確認<ExternalLink size={12} /></a>
          <label>バス時刻表<i className="source-badge web">WEB</i><textarea value={listValue(plan.timetables)} onChange={(event) => onUpdate("timetables", toList(event.target.value))} /></label>
          {timetableCitationLinks.length ? (
            <div className="inline-citation-list" aria-label="バス時刻表の引用リンク">
              {timetableCitationLinks.map((citation) => (
                <span className="inline-citation" key={citation.key}>
                  <strong>{citation.direction}</strong>
                  <a href={citation.url} rel="noreferrer" target="_blank">{citation.label}<ExternalLink size={12} /></a>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="editor-section" id="tables">
          <div className="section-title"><span>04</span><div><h2>表に入る抽出項目</h2><p>Wordでは同じ項目セルを結合して出力します。画面では編集しやすい行形式にしています。</p></div></div>
          <div className="editable-table-wrap">
            <h3>予算</h3>
            <div className="editable-table-scroll"><table className="editable-table"><thead><tr><th>項目</th><th>金額</th><th>備考</th></tr></thead><tbody>
              {Array.from({ length: 6 }).map((_, rowIndex) => {
                const cells = pipeCells(plan.budgetItems[rowIndex] ?? "", 3);
                const itemSpan = categoryCellSpan(plan.budgetItems, rowIndex);
                return <tr key={`budget-${rowIndex}`}>
                  {itemSpan ? <th rowSpan={itemSpan}><input aria-label={`予算 ${rowIndex + 1}行目 項目`} value={cells[0]} onChange={(event) => updateBudgetCell(rowIndex, 0, event.target.value)} /></th> : null}
                  <td><input aria-label={`予算 ${rowIndex + 1}行目 金額`} value={cells[1]} onChange={(event) => updateBudgetCell(rowIndex, 1, event.target.value)} /></td>
                  <td><input aria-label={`予算 ${rowIndex + 1}行目 備考`} value={cells[2]} onChange={(event) => updateBudgetCell(rowIndex, 2, event.target.value)} /></td>
                </tr>;
              })}
            </tbody></table></div>
          </div>
          <div className="editable-table-wrap">
            <h3>関係諸機関</h3>
            <div className="editable-table-scroll"><table className="editable-table"><thead><tr><th>項目</th><th>名称</th><th>連絡先</th></tr></thead><tbody>
              {displayedOrganizations.map(({ row, index }, rowIndex) => {
                const cells = pipeCells(row, 3);
                const itemSpan = categoryCellSpan(displayedOrganizationRows, rowIndex);
                return <tr key={`organization-${index}`}>
                  {itemSpan ? <th rowSpan={itemSpan}><input aria-label={`関係諸機関 ${rowIndex + 1}行目 項目`} value={cells[0]} onChange={(event) => updateOrganizationCell(index, 0, event.target.value)} /></th> : null}
                  <td><input aria-label={`関係諸機関 ${rowIndex + 1}行目 名称`} value={cells[1]} onChange={(event) => updateOrganizationCell(index, 1, event.target.value)} /></td>
                  <td><input aria-label={`関係諸機関 ${rowIndex + 1}行目 連絡先`} value={cells[2]} onChange={(event) => updateOrganizationCell(index, 2, event.target.value)} /></td>
                </tr>;
              })}
            </tbody></table></div>
          </div>
        </section>

        <section className="editor-section" id="images">
          <div className="section-title"><span>05</span><div><h2>Wordへ貼る画像</h2><p>概念図とバス時刻表のスクリーンショットをここで差し替えできます。</p></div></div>
          {plan.routeMapUrl ? <a className="route-map-link" href={plan.routeMapUrl} rel="noreferrer" target="_blank">ヤマレコでルートを開く<ExternalLink size={14} /></a> : null}
          <ScreenshotPicker files={routeMapImage ? [routeMapImage] : []} label="ルート全体の概念図画像" onFiles={(files) => onRouteMapImageChange(files[0] ?? null)} onRemove={() => onRouteMapImageChange(null)} />
          <ScreenshotPicker files={timetableImages} label="必要なバス時刻表画像" multiple onFiles={(files) => setTimetableImages((current) => [...current, ...files])} onRemove={(index) => setTimetableImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
        </section>
        <button className="back-to-top-button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button">
          一番上に戻る
        </button>
      </article>
      {previewDocument ? <WordPreview document={previewDocument} onClose={() => setPreviewDocument(null)} /> : null}
    </section>
  );
}

function ScreenshotPicker({
  files,
  label,
  multiple = false,
  onFiles,
  onRemove,
}: {
  files: File[];
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (index: number) => void;
}) {
  function pastedFiles(event: ClipboardEvent<HTMLDivElement>) {
    const images = Array.from(event.clipboardData.files).filter((file) => file.type === "image/png" || file.type === "image/jpeg");
    if (images.length) {
      event.preventDefault();
      onFiles(multiple ? images : images.slice(0, 1));
    }
  }

  return (
    <div className="screenshot-picker" onPaste={pastedFiles} tabIndex={0}>
      <div><strong>{label}</strong><span>ここを選択して画像を貼り付けるか、ファイルを選択</span></div>
      <label className="screenshot-button"><Upload size={17} />画像を選択
        <input
          accept="image/png,image/jpeg"
          multiple={multiple}
          onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
          type="file"
        />
      </label>
      {files.length > 0 ? <div className="screenshot-thumbnails">
        {files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}>
          <FileImagePreview file={file} alt={`${label} ${index + 1}`} />
          <button aria-label={`${file.name}を削除`} onClick={() => onRemove(index)} type="button"><X size={15} /></button>
        </div>)}
      </div> : null}
    </div>
  );
}

function FileImagePreview({ file, alt }: { file: File; alt: string }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => {
    return () => URL.revokeObjectURL(url);
  }, [url]);
  // Blob URLs are local-only previews and cannot use the framework image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} src={url} />;
}

function WordPreview({
  document: wordDocument,
  onClose,
}: {
  document: Uint8Array;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [renderError, setRenderError] = useState("");
  const [rendering, setRendering] = useState(true);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(0.85);

  useEffect(() => {
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function renderDocument() {
      if (!container.current) return;
      container.current.replaceChildren();
      setRendering(true);
      setRenderError("");
      try {
        const { renderAsync } = await import("docx-preview");
        await renderAsync(wordDocument, container.current, undefined, {
          breakPages: true,
          ignoreHeight: false,
          ignoreWidth: false,
          inWrapper: true,
          useBase64URL: true,
        });
        if (!cancelled && container.current) setPages(container.current.querySelectorAll("section.docx").length);
      } catch (reason) {
        if (!cancelled) setRenderError(reason instanceof Error ? reason.message : "Wordを表示できませんでした。");
      } finally {
        if (!cancelled) setRendering(false);
      }
    }
    void renderDocument();
    return () => { cancelled = true; };
  }, [wordDocument]);

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Word出力プレビュー">
      <div className="preview-window">
        <div className="preview-window-toolbar">
          <div><strong>生成されたWordを確認</strong><span>{pages ? `${pages}ページ・内蔵書式へ反映済み` : "Wordを描画しています"}</span></div>
          <div className="preview-window-actions">
            <div className="zoom-controls" aria-label="プレビュー倍率">
              <button aria-label="縮小" disabled={zoom <= 0.55} onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))} type="button"><Minus size={17} /></button>
              <output aria-live="polite">{Math.round(zoom * 100)}%</output>
              <button aria-label="拡大" disabled={zoom >= 1.25} onClick={() => setZoom((value) => Math.min(1.25, value + 0.1))} type="button"><Plus size={17} /></button>
              <button aria-label="倍率をリセット" onClick={() => setZoom(0.85)} type="button"><Maximize2 size={16} /></button>
            </div>
            <button aria-label="プレビューを閉じる" onClick={onClose} ref={closeButton} type="button"><X size={22} /></button>
          </div>
        </div>
        <div aria-busy={rendering} className="preview-scroll">
          {rendering ? <div className="word-render-loading" role="status"><LoaderCircle className="spin" size={22} />Wordを生成しています</div> : null}
          {renderError ? <div className="word-render-error" role="alert">{renderError}</div> : null}
          <div className="docx-renderer" ref={container} style={{ zoom }} />
        </div>
      </div>
    </div>
  );
}
