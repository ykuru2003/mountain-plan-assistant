"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
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
  ShieldCheck,
  Route,
  Upload,
  X,
} from "lucide-react";
import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
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
  };
};

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

const AGENCY_TYPES = [
  "現地連絡先", "顧問", "大学",
  "コーチ", "コーチ", "コーチ", "コーチ", "コーチ", "コーチ",
  "主将", "バス", "タクシー", "警察", "山小屋", "病院",
];

function normalizeAgencyRows(values: string[]) {
  const rows = AGENCY_TYPES.map((type) => `${type}｜｜`);
  const used = new Set<number>();
  for (const value of values) {
    const [rawType = "", rawName = "", rawContact = ""] = value.split(/[｜|]/).map((part) => part.trim());
    const exact = AGENCY_TYPES.includes(rawType);
    const inferred = exact ? rawType
      : /警察/.test(value) ? "警察"
        : /病院|医療/.test(value) ? "病院"
          : /山小屋|ヒュッテ|山荘/.test(value) ? "山小屋"
            : /タクシー/.test(value) ? "タクシー"
              : /バス/.test(value) ? "バス" : "";
    const index = AGENCY_TYPES.findIndex((type, itemIndex) => type === inferred && !used.has(itemIndex));
    const contact = rawContact && !/^TEL\s*[:：]/i.test(rawContact) && /\d/.test(rawContact)
      ? `TEL: ${rawContact}` : rawContact.replace(/^TEL\s*[:：]\s*/i, "TEL: ");
    if (index < 0) {
      if (inferred || rawType) rows.push(`${inferred || rawType}｜${exact ? rawName : rawType}｜${contact || rawName}`);
      continue;
    }
    used.add(index);
    rows[index] = exact ? `${rawType}｜${rawName}｜${contact}` : `${inferred}｜${rawType}｜${rawName && `TEL: ${rawName.replace(/^TEL\s*[:：]\s*/i, "")}`}`;
  }
  return rows;
}

function normalizeBudgetRows(values: string[]) {
  const rows = values.length ? values.slice(0, 6) : [...BUDGET_DEFAULTS];
  while (rows.length < 6) rows.push(BUDGET_DEFAULTS[rows.length]);
  return rows.map((row, index) => {
    const [item = "", rawAmount = "", rawNote = ""] = row.split(/[｜|]/).map((part) => part.trim());
    let amount = /^(?:0|0円|¥0|￥0)$/.test(rawAmount) ? "" : rawAmount;
    const note = rawNote.replace(/1人分概算/g, "").trim();
    if (/タクシー/.test(`${item}${note}`)) amount = "未定";
    if (index === 5 && amount && !/[+＋]α$/.test(amount)) amount = `${amount}＋α`;
    if (index === 5 && !amount) amount = "＋α";
    return `${item || BUDGET_DEFAULTS[index].split("｜")[0]}｜${amount}｜${note}`;
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

const PROGRESS_STAGES = [
  { label: "ヤマレコを読み取り中", detail: "日程・ルート・山域を確認" },
  { label: "Web検索中", detail: "交通・宿泊・日の入りを確認" },
  { label: "Wordへ転記中", detail: "計画書の項目へ反映" },
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

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"input" | "generating" | "review">("input");
  const [stage, setStage] = useState(0);
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [generationDurationMs, setGenerationDurationMs] = useState(0);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [routeMapImage, setRouteMapImage] = useState<File | null>(null);

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
    setStatus("generating");
    const startedAt = performance.now();

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as GenerateResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "計画書案を作成できませんでした。");
      setStage(2);
      const normalized = normalizePlan(data.plan);
      setPlan(normalized);
      if (data.generatedImages?.routeMap) {
        const bytes = Uint8Array.from(atob(data.generatedImages.routeMap.bytesBase64), (char) => char.charCodeAt(0));
        const file = new File([bytes], data.generatedImages.routeMap.filename ?? "route-map.png", {
          type: data.generatedImages.routeMap.contentType || "image/png",
        });
        setRouteMapImage(file);
      }
      setNotice(data.warning ?? (data.demoMode ? "Web検索は未設定です。ヤマレコから取得した内容を確認してください。" : ""));
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      const durationMs = performance.now() - startedAt;
      setElapsedMs(durationMs);
      setGenerationDurationMs(durationMs);
      console.info("[YAMARECO TO WORD] generation completed", {
        durationMs: Math.round(durationMs),
        completedAt: new Date().toISOString(),
      });
      setStatus("review");
    } catch (reason) {
      const durationMs = performance.now() - startedAt;
      console.info("[YAMARECO TO WORD] generation failed", {
        durationMs: Math.round(durationMs),
        completedAt: new Date().toISOString(),
      });
      setError(reason instanceof Error ? reason.message : "計画書案を作成できませんでした。");
      setStatus("input");
    }
  }

  function updatePlan<K extends keyof Plan>(key: K, value: Plan[K]) {
    setPlan((current) => ({ ...current, [key]: value }));
  }

  const activeStep = status === "review" ? 3 : status === "generating" ? 2 : 1;

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">本文へ移動</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="YAMARECO TO WORD トップ">
          <span className="brand-mark"><Route size={25} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>YAMARECO TO WORD</strong></span>
        </a>
      </header>

      <div className="page" id="main-content">
        <ol className="stepper" aria-label="作成手順">
          {["URLを入力", "内容を確認", "Word完成"].map((label, index) => {
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
            routeMapImage={routeMapImage}
            onBack={() => setStatus("input")}
            onUpdate={updatePlan}
            onRouteMapImageChange={setRouteMapImage}
          />
        ) : (
          <section className="workspace">
            <article className="card input-card">
              <div className="eyebrow"><MapPinned size={18} />YAMARECO TO WORD</div>
              <h1><span>YAMARECO</span><br />TO WORD</h1>
              <p className="lead">ヤマレコの公開計画URLからWord計画書を自動作成。</p>

              <div className="creation-flow" aria-label="Word計画書の作成フロー">
                <div className="flow-card flow-sources">
                  <small>01</small>
                  <strong><MapPinned size={21} />ヤマレコのURL</strong>
                </div>
                <span className="flow-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
                <div className="flow-card">
                  <small>02</small>
                  <strong><Search size={21} />web検索</strong>
                </div>
                <span className="flow-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
                <div className="flow-card flow-output">
                  <small>03</small>
                  <strong><FileText size={21} />word完成</strong>
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

              {error ? <div className="error-message" role="alert">{error}</div> : null}

              <button className="primary-button" disabled={status === "generating"} onClick={generatePlan} type="button">
                {status === "generating" ? <LoaderCircle className="spin" size={23} /> : <Route size={23} />}
                {status === "generating" ? "計画書を作成中" : "Word計画書を作成"}
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
          <strong>🏔️ Field Desk</strong>
          <p>ヤマレコから情報を自動抽出し、Word計画書の作成をサポート。必要な箇所だけ手動で完成させます。</p>
        </div>
        <div>
          <strong>⚡ 高速処理</strong>
          <p>公開情報の解析とWeb検索を組み合わせ、数十秒で計画書案を生成。交通・宿泊・予算の最新情報を反映します。</p>
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
  routeMapImage,
  onBack,
  onUpdate,
  onRouteMapImageChange,
}: {
  plan: Plan;
  notice: string;
  generationDurationMs: number;
  routeMapImage: File | null;
  onBack: () => void;
  onUpdate: <K extends keyof Plan>(key: K, value: Plan[K]) => void;
  onRouteMapImageChange: (file: File | null) => void;
}) {
  const [wordError, setWordError] = useState("");
  const [wordBusy, setWordBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Uint8Array | null>(null);
  const [timetableImages, setTimetableImages] = useState<File[]>([]);
  const [budgetRecalculating, setBudgetRecalculating] = useState(false);
  const transportRecalculation = useRef<number | null>(null);
  const listValue = (value: string[]) => value.join("\n");
  const toList = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
  const toScheduleList = (value: string) => value
    .split("\n")
    .map((item) => item.trim())
    .slice(value.startsWith("\n") ? 1 : 0, value.endsWith("\n") ? -1 : undefined);
  const requiredFields: Array<{ label: string; value: string | unknown[] }> = [
    { label: "計画名", value: plan.title }, { label: "日程", value: plan.dates },
    { label: "山域", value: plan.area }, { label: "山行目的", value: plan.purpose },
    { label: "集合", value: plan.meeting }, { label: "解散", value: plan.dismissal },
    { label: "入山地点", value: plan.entryPoint }, { label: "下山地点", value: plan.exitPoint },
    { label: "入山時刻", value: plan.entryTime }, { label: "下山時刻", value: plan.exitTime },
    { label: "日別行程", value: plan.schedule }, { label: "交通", value: plan.transport },
    { label: "宿泊", value: plan.lodging }, { label: "コースタイム倍率", value: plan.courseTimeMultiplier },
    { label: "日の入り", value: plan.sunset }, { label: "参照元", value: plan.sources },
  ];
  const scheduleDayCount = plan.schedule.filter((line) => /^＜\d+日目/.test(line)).length;
  if (scheduleDayCount > 1) requiredFields.push({ label: "日の出", value: plan.sunrise });
  const missingFields = requiredFields.filter(({ value }) => Array.isArray(value) ? value.length === 0 : value.trim().length === 0);
  const completed = requiredFields.length - missingFields.length;
  const completion = Math.round((completed / requiredFields.length) * 100);

  useEffect(() => () => {
    if (transportRecalculation.current) window.clearTimeout(transportRecalculation.current);
  }, []);

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
    <section className="review-layout">
      <div className="review-toolbar">
        <button className="text-button" onClick={onBack} type="button"><ArrowLeft size={18} />入力へ戻る</button>
        <div className="review-toolbar-title"><small>編集中の計画書</small><strong>{plan.title || "名称未設定の計画書"}</strong>{generationDurationMs > 0 ? <span className="generation-result"><Clock3 size={13} />作成時間 {formatElapsed(generationDurationMs)}</span> : null}</div>
        <div className="review-toolbar-actions">
          <button className="outline-button" disabled={previewBusy} onClick={previewWord} type="button"><Eye size={17} />{previewBusy ? "作成中" : "Wordプレビュー"}</button>
          <button className="primary-small" disabled={wordBusy} onClick={downloadWord} type="button"><Download size={17} />{wordBusy ? "作成中" : "Word出力"}</button>
        </div>
      </div>
      {wordError ? <div className="word-error word-error-banner" role="alert">{wordError}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}
      <article className="plan-editor">
        <div className="editor-heading"><span>WORD CONTENT EDITOR</span><small>修正内容を標準Word書式へ反映</small></div>
        <div className="manual-edit-guide">
          <span>手動入力</span>
          <p>黄色の欄を確認・追記してください。入力後は画面上部の「Wordプレビュー」で、実際の記入位置を確認できます。</p>
        </div>
        <nav className="section-nav" aria-label="入力項目へ移動">
          <a href="#section-basic"><span>01</span>基本情報</a>
          <a href="#section-route"><span>02</span>日別ルート</a>
          <a href="#section-access"><span>03</span>交通・宿泊</a>
          <a href="#section-budget"><span>04</span>予算・連絡先</a>
          <a href="#section-map"><span>05</span>概念図</a>
        </nav>
        <div className="completion-card">
          <div><ClipboardCheck size={22} /><span><strong>Word記入項目 {completion}%</strong><small>{completed} / {requiredFields.length}項目を確認済み</small></span></div>
          <progress max="100" value={completion}>{completion}%</progress>
          <p className={missingFields.length ? "completion-detail incomplete" : "completion-detail complete"}>
            {missingFields.length ? <>未入力：{missingFields.map(({ label }) => label).join("、")}。取得できなかった項目は手動で補ってください。</> : <><CheckCircle2 size={15} />Word出力に必要な項目が揃っています。</>}
          </p>
        </div>

        <section className="editor-section" id="section-basic">
          <div className="section-title"><span>01</span><div><h2>基本情報</h2><p>計画書1ページ目の基本欄</p></div></div>
          <label>計画名 <em className="source-badge yamareco">ヤマレコ</em><span className="required-mark">必須</span><input aria-invalid={!plan.title.trim()} aria-required="true" value={plan.title} onChange={(event) => onUpdate("title", event.target.value)} /></label>
          <div className="editor-grid">
            <label>日程 <em className="source-badge yamareco">ヤマレコ</em><span className="required-mark">必須</span><input aria-invalid={!plan.dates.trim()} aria-required="true" value={plan.dates} onChange={(event) => onUpdate("dates", event.target.value)} /></label>
            <label>山域 <em className="source-badge yamareco">ヤマレコ</em><span className="required-mark">必須</span><input aria-invalid={!plan.area.trim()} aria-required="true" value={plan.area} onChange={(event) => onUpdate("area", event.target.value)} /></label>
          </div>
          <label className="manual-field">山行目的 <span>手動入力</span><input value={plan.purpose} onChange={(event) => onUpdate("purpose", event.target.value)} /></label>
          <div className="editor-grid">
            <label className="manual-field">集合 <span>手動入力</span><input value={plan.meeting} onChange={(event) => onUpdate("meeting", event.target.value)} /></label>
            <label className="manual-field">解散 <span>手動入力</span><input value={plan.dismissal} onChange={(event) => onUpdate("dismissal", event.target.value)} /></label>
          </div>
          <div className="editor-grid">
            <label>入山地点 <em className="source-badge yamareco">ヤマレコ</em><input value={plan.entryPoint} onChange={(event) => onUpdate("entryPoint", event.target.value)} /></label>
            <label>下山地点 <em className="source-badge yamareco">ヤマレコ</em><input value={plan.exitPoint} onChange={(event) => onUpdate("exitPoint", event.target.value)} /></label>
          </div>
          <div className="editor-grid">
            <label>入山時刻 <em className="source-badge yamareco">ヤマレコ</em><input inputMode="numeric" placeholder="7/11(土) 11:00" value={plan.entryTime} onChange={(event) => onUpdate("entryTime", event.target.value)} /></label>
            <label>下山時刻 <em className="source-badge yamareco">ヤマレコ</em><input inputMode="numeric" placeholder="7/13(月) 16:00" value={plan.exitTime} onChange={(event) => onUpdate("exitTime", event.target.value)} /></label>
          </div>
        </section>

        <section className="editor-section" id="section-route">
          <div className="section-title"><span>02</span><div><h2>日別ルート <em className="source-badge yamareco">ヤマレコ</em></h2><p>主要地点を日ごとに整理し、時刻は5分単位</p></div></div>
          <label className="schedule-field">日別行程 <span>起床・就寝時刻は手動入力</span><textarea aria-invalid={!plan.schedule.some(Boolean)} aria-required="true" value={listValue(plan.schedule)} onChange={(event) => onUpdate("schedule", toScheduleList(event.target.value))} /></label>
          <div className="editor-grid">
            <label>コースタイム倍率 <em className="source-badge yamareco">ヤマレコ</em><input value={plan.courseTimeMultiplier} onChange={(event) => onUpdate("courseTimeMultiplier", event.target.value)} /></label>
            <label>初日の日の入り時刻 <em className="source-badge yamareco">ヤマレコ</em><input value={plan.sunset} onChange={(event) => onUpdate("sunset", event.target.value)} /></label>
          </div>
          {scheduleDayCount > 1 ? <label>日の出時刻 <em className="source-badge web">日の出時刻を検索</em><input value={plan.sunrise} onChange={(event) => onUpdate("sunrise", event.target.value)} /></label> : null}
          <SourceLinks sources={plan.sources} prefixes={["日の出", "日の入り"]} />
        </section>

        <section className="editor-section" id="section-access">
          <div className="section-title"><span>03</span><div><h2>交通・宿泊</h2><p>新宿起点の交通と、宿泊施設の予約・料金・水場条件</p></div></div>
          <div className="field-title-row"><strong>交通機関 <em className="source-badge web">交通経路・運賃を検索</em></strong><a href="https://www.navitime.co.jp/transfer/" rel="noreferrer" target="_blank">NAVITIMEで確認<ExternalLink size={13} /></a></div>
          <label className={!plan.transport.trim() ? "manual-field field-without-title" : "field-without-title"}><textarea aria-label="交通機関" aria-invalid={!plan.transport.trim()} aria-required="true" value={plan.transport} onChange={(event) => updateTransport(event.target.value)} /></label>
          {budgetRecalculating ? <p className="inline-status"><LoaderCircle className="spin" size={14} />変更した交通経路から費用を再計算中</p> : null}
          <SourceLinks sources={plan.sources} prefixes={["交通", "予算"]} />
          <label className={!plan.lodging.trim() ? "manual-field" : ""}>テント場・山小屋 <em className="source-badge web">予約・料金・水場を検索</em><textarea aria-invalid={!plan.lodging.trim()} aria-required="true" value={plan.lodging} onChange={(event) => onUpdate("lodging", event.target.value)} /></label>
          <a className="reference-tool-link" href="https://yamagoya-mirumiru.korokoro-dev.jp/" rel="noreferrer" target="_blank">山小屋みるみるで予約状況を確認<ExternalLink size={13} /></a>
          <SourceLinks sources={[...plan.sources, ...plan.lodgingLinks.map((item) => ({ ...item, title: `宿泊：${item.title}` }))]} prefixes={["宿泊", "山小屋"]} />
          {plan.lodgingLinks.length > 0 ? <div className="lodging-links"><strong>宿泊施設の公式ページ</strong>{plan.lodgingLinks.map((item) => <a href={item.url} key={item.url} rel="noreferrer" target="_blank">{item.title}<ExternalLink size={14} /></a>)}</div> : <p className="manual-link-note">公式URLが取得できなかった場合は、施設名で公式サイトを確認してください。</p>}
          <label>バス時刻表 <em className="source-badge web">往路・復路を判定</em><span>鉄道は不要／利用するバスのみ</span><textarea value={listValue(plan.timetables)} onChange={(event) => onUpdate("timetables", toList(event.target.value))} /></label>
          <ScreenshotPicker
            files={timetableImages}
            label="必要なバス時刻表画像"
            multiple
            onFiles={(files) => setTimetableImages((current) => [...current, ...files])}
            onRemove={(index) => setTimetableImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          />
        </section>

        <section className="editor-section" id="section-budget">
          <div className="section-title"><span>04</span><div><h2>予算・関係諸機関</h2><p>交通費・宿泊費・連絡先を公式情報から確認</p></div></div>
          <EditablePlanTable
            caption="予算"
            headers={["項目", "金額", "備考"]}
            rows={plan.budgetItems}
            onChange={(rows) => onUpdate("budgetItems", rows)}
          />
          <SourceLinks sources={plan.sources} prefixes={["予算", "関係諸機関", "病院", "山小屋"]} />
          <EditablePlanTable
            caption="関係諸機関"
            headers={["項目", "名称", "連絡先"]}
            lockedFirstColumn
            rows={plan.relatedOrganizations}
            onChange={(rows) => onUpdate("relatedOrganizations", rows)}
          />
        </section>

        <section className="editor-section" id="section-map">
          <div className="section-title"><span>05</span><div><h2>概念図 <em className="source-badge yamareco">ヤマレコ</em></h2><p>ルート全体を画像で確認し、Wordへ貼付</p></div></div>
          {plan.routeMapUrl ? <a className="route-map-link" href={plan.routeMapUrl} rel="noreferrer" target="_blank">ヤマレコでルートを開いてスクリーンショットを撮る<ExternalLink size={15} /></a> : null}
          <ScreenshotPicker
            files={routeMapImage ? [routeMapImage] : []}
            label="ルート全体の概念図画像"
            onFiles={(files) => onRouteMapImageChange(files[0] ?? null)}
            onRemove={() => onRouteMapImageChange(null)}
          />
        </section>
      </article>
      {previewDocument ? <WordPreview document={previewDocument} onClose={() => setPreviewDocument(null)} /> : null}
    </section>
  );
}

function SourceLinks({ sources, prefixes }: { sources: Source[]; prefixes: string[] }) {
  const filtered = sources.filter((source) => prefixes.some((prefix) => source.title.startsWith(prefix)));
  if (!filtered.length) return null;
  return <div className="field-source-links"><span>参照元</span>{filtered.map((source) => <a href={source.url} key={`${source.title}-${source.url}`} rel="noreferrer" target="_blank">{source.title}<ExternalLink size={12} /></a>)}</div>;
}

function EditablePlanTable({
  caption,
  headers,
  rows,
  lockedFirstColumn = false,
  onChange,
}: {
  caption: string;
  headers: string[];
  rows: string[];
  lockedFirstColumn?: boolean;
  onChange: (rows: string[]) => void;
}) {
  function updateCell(rowIndex: number, columnIndex: number, value: string) {
    const nextRows = [...rows];
    const cells = (nextRows[rowIndex] ?? "").split(/[｜|]/).map((cell) => cell.trim());
    while (cells.length < headers.length) cells.push("");
    cells[columnIndex] = value.replace(/[｜|]/g, " ");
    nextRows[rowIndex] = cells.slice(0, headers.length).join("｜");
    onChange(nextRows);
  }

  return (
    <div className="editable-table-wrap">
      <h3>{caption}</h3>
      <div className="editable-table-scroll">
        <table className="editable-table">
          <thead><tr>{headers.map((header) => <th key={header} scope="col">{header}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const cells = row.split(/[｜|]/).map((cell) => cell.trim());
              while (cells.length < headers.length) cells.push("");
              return (
                <tr className={cells.slice(1).every((cell) => !cell) ? "needs-manual" : ""} key={`${caption}-${rowIndex}`}>
                  {cells.slice(0, headers.length).map((cell, columnIndex) => columnIndex === 0 && lockedFirstColumn
                    ? <th key={columnIndex} scope="row">{cell}</th>
                    : <td key={columnIndex}><input aria-label={`${caption} ${rowIndex + 1}行目 ${headers[columnIndex]}`} value={cell} onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)} /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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
