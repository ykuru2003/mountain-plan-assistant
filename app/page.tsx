"use client";

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  FileText,
  HelpCircle,
  Link2,
  LockKeyhole,
  LoaderCircle,
  MapPinned,
  Mountain,
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
  exitPoint: string;
  summary: string;
  route: string;
  schedule: string[];
  courseTimeMultiplier: string;
  sunset: string;
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
};

const EMPTY_PLAN: Plan = {
  title: "",
  dates: "",
  area: "",
  purpose: "",
  meeting: "",
  dismissal: "",
  entryPoint: "",
  exitPoint: "",
  summary: "",
  route: "",
  schedule: [],
  courseTimeMultiplier: "",
  sunset: "",
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
  return merged;
}

const STAGES = ["ヤマレコを読み込み", "交通・宿泊を確認", "計画書へ整形"];

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
  const [urlChecked, setUrlChecked] = useState(false);
  const [status, setStatus] = useState<"input" | "generating" | "review">("input");
  const [stage, setStage] = useState(0);
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const validUrl = useMemo(() => isYamarecoUrl(url), [url]);

  useEffect(() => {
    if (status !== "generating") return;
    const first = window.setTimeout(() => setStage(1), 900);
    const second = window.setTimeout(() => setStage(2), 2200);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [status]);

  function checkUrl() {
    setUrlChecked(true);
    setError(validUrl ? "" : "https://www.yamareco.com/ から始まる公開URLを入力してください。");
  }

  async function generatePlan() {
    setUrlChecked(true);
    if (!validUrl) {
      setError("ヤマレコの公開URLを確認してください。");
      return;
    }
    setError("");
    setNotice("");
    setStage(0);
    setStatus("generating");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as GenerateResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "計画書案を作成できませんでした。");
      const normalized = normalizePlan(data.plan);
      setPlan(normalized);
      setNotice(data.warning ?? (data.demoMode ? "Web検索は未設定です。ヤマレコから取得した内容を確認してください。" : ""));
      setStatus("review");
    } catch (reason) {
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
      <header className="topbar">
        <a className="brand" href="#top" aria-label="登山計画書 Field Desk トップ">
          <span className="brand-mark"><Mountain size={28} strokeWidth={2.4} /></span>
          <span className="brand-copy"><strong>登山計画書</strong><small>ALPINE DOCUMENTS</small></span>
        </a>
        <nav className="header-actions" aria-label="補助メニュー">
          <a href="#guide"><HelpCircle size={19} />使い方</a>
          <span className="public-chip"><ShieldCheck size={19} />WORD FORMAT INCLUDED</span>
        </nav>
      </header>

      <div className="page" id="top">
        <ol className="stepper" aria-label="作成手順">
          {["計画を読み込む", "公開情報を整える", "Wordへ出力"].map((label, index) => {
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
            onBack={() => setStatus("input")}
            onUpdate={updatePlan}
          />
        ) : (
          <section className="workspace">
            <article className="card input-card">
              <div className="eyebrow"><MapPinned size={18} />YAMARECO PLAN IMPORT</div>
              <h1>公開計画を、<br />提出できる形へ。</h1>
              <p className="lead">ヤマレコの行程を読み込み、交通・宿泊・予算をひとつの登山計画書にまとめます。</p>

              <label htmlFor="yamareco-url">ヤマレコの公開URL</label>
              <div className="url-row">
                <div className={`input-wrap ${urlChecked ? (validUrl ? "valid" : "invalid") : ""}`}>
                  <Link2 size={21} />
                  <input
                    id="yamareco-url"
                    inputMode="url"
                    placeholder="https://www.yamareco.com/modules/..."
                    value={url}
                    onChange={(event) => { setUrl(event.target.value.trim()); setUrlChecked(false); }}
                    onBlur={() => url && checkUrl()}
                  />
                  {urlChecked && validUrl ? <CheckCircle2 className="valid-icon" size={20} /> : null}
                </div>
                <button className="outline-button" onClick={checkUrl} type="button">URLを確認</button>
              </div>
              <p className="helper">公開設定の山行記録・計画URLを入力してください。</p>

              {error ? <div className="error-message" role="alert">{error}</div> : null}

              <button className="primary-button" disabled={status === "generating"} onClick={generatePlan} type="button">
                {status === "generating" ? <LoaderCircle className="spin" size={23} /> : <Route size={23} />}
                {status === "generating" ? STAGES[stage] : "計画書を組み立てる"}
              </button>
              <p className="time-note"><Clock3 size={18} />入力内容と公開情報をもとに、計画書案を作成します。</p>
            </article>

          </section>
        )}

        <section className="guide" id="guide">
          <Search size={22} />
          <div><strong>標準書式を内蔵</strong><p>見本のWord書式はアプリに組み込み済みです。公開情報を確認し、地図と時刻表の画像を添えて、そのまま計画書として出力できます。</p></div>
        </section>
      </div>
    </main>
  );
}

function ReviewView({
  plan,
  notice,
  onBack,
  onUpdate,
}: {
  plan: Plan;
  notice: string;
  onBack: () => void;
  onUpdate: <K extends keyof Plan>(key: K, value: Plan[K]) => void;
}) {
  const [wordError, setWordError] = useState("");
  const [wordBusy, setWordBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Uint8Array | null>(null);
  const [routeMapImage, setRouteMapImage] = useState<File | null>(null);
  const [timetableImages, setTimetableImages] = useState<File[]>([]);
  const listValue = (value: string[]) => value.join("\n");
  const toList = (value: string) => value.split("\n").map((item) => item.trim()).filter(Boolean);
  const requiredValues = [
    plan.title, plan.dates, plan.area, plan.purpose, plan.meeting, plan.dismissal,
    plan.entryPoint, plan.exitPoint, plan.schedule, plan.transport,
    plan.lodging, plan.courseTimeMultiplier, plan.sunset, plan.sources,
  ];
  const completed = requiredValues.filter((value) => Array.isArray(value) ? value.length > 0 : value.trim().length > 0).length;
  const completion = Math.round((completed / requiredValues.length) * 100);

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
        <span className="toolbar-note"><FileText size={17} />標準Word書式を使用</span>
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      <article className="plan-editor">
        <div className="editor-heading"><span>PLAN WORKSHEET</span><small>標準Word書式へ直接出力</small></div>
        <div className="completion-card">
          <div><ClipboardCheck size={22} /><span><strong>必須項目の充足度 {completion}%</strong><small>{completed} / {requiredValues.length}項目</small></span></div>
          <progress max="100" value={completion}>{completion}%</progress>
        </div>

        <section className="editor-section">
          <div className="section-title"><span>01</span><div><h2>基本情報 <em className="source-badge web">Web検索</em></h2><p>計画書1ページ目の基本欄</p></div></div>
          <label>計画名<input value={plan.title} onChange={(event) => onUpdate("title", event.target.value)} /></label>
          <div className="editor-grid">
            <label>日程<input value={plan.dates} onChange={(event) => onUpdate("dates", event.target.value)} /></label>
            <label>山域<input value={plan.area} onChange={(event) => onUpdate("area", event.target.value)} /></label>
          </div>
          <label>山行目的<textarea value={plan.purpose} onChange={(event) => onUpdate("purpose", event.target.value)} /></label>
          <div className="editor-grid">
            <label>集合<input value={plan.meeting} onChange={(event) => onUpdate("meeting", event.target.value)} /></label>
            <label>解散<input value={plan.dismissal} onChange={(event) => onUpdate("dismissal", event.target.value)} /></label>
          </div>
          <div className="editor-grid">
            <label>入山地点<input value={plan.entryPoint} onChange={(event) => onUpdate("entryPoint", event.target.value)} /></label>
            <label>下山地点<input value={plan.exitPoint} onChange={(event) => onUpdate("exitPoint", event.target.value)} /></label>
          </div>
        </section>

        <section className="editor-section">
          <div className="section-title"><span>02</span><div><h2>日別ルート <em className="source-badge yamareco">ヤマレコ</em></h2><p>水場・トイレ・山頂・小屋だけを抽出し、時刻は5分単位</p></div></div>
          <label>日別行程 <span>1日につき1行</span><textarea value={listValue(plan.schedule)} onChange={(event) => onUpdate("schedule", toList(event.target.value))} /></label>
          <div className="editor-grid">
            <label>コースタイム倍率<input value={plan.courseTimeMultiplier} onChange={(event) => onUpdate("courseTimeMultiplier", event.target.value)} /></label>
            <label>日の入り時刻 <em className="source-badge yamareco">ヤマレコ</em><input value={plan.sunset} onChange={(event) => onUpdate("sunset", event.target.value)} /></label>
          </div>
        </section>

        <section className="editor-section">
          <div className="section-title"><span>03</span><div><h2>交通・宿泊</h2><p>新宿起点の交通と、宿泊施設の予約・料金・水場条件</p></div></div>
          <label>交通機関 <em className="source-badge web">Web検索</em><textarea value={plan.transport} onChange={(event) => onUpdate("transport", event.target.value)} /></label>
          <label>テント場・山小屋 <em className="source-badge web">Web検索＋ヤマレコ</em><textarea value={plan.lodging} onChange={(event) => onUpdate("lodging", event.target.value)} /></label>
          {plan.lodgingLinks.length > 0 ? <div className="lodging-links"><strong>宿泊地リンク</strong>{plan.lodgingLinks.map((item) => <a href={item.url} key={item.url} rel="noreferrer" target="_blank">{item.title}<ExternalLink size={14} /></a>)}</div> : null}
          <label>交通機関の時刻表 <em className="source-badge web">Web検索</em><span>1行に1便</span><textarea value={listValue(plan.timetables)} onChange={(event) => onUpdate("timetables", toList(event.target.value))} /></label>
          <ScreenshotPicker
            files={timetableImages}
            label="必要な時刻表のスクリーンショット"
            multiple
            onFiles={(files) => setTimetableImages((current) => [...current, ...files])}
            onRemove={(index) => setTimetableImages((current) => current.filter((_, itemIndex) => itemIndex !== index))}
          />
        </section>

        <section className="editor-section">
          <div className="section-title"><span>04</span><div><h2>予算・関係諸機関 <em className="source-badge web">Web検索</em></h2><p>新宿起点。JR片道101km以上は学割2割引き（10の位で切り捨て）</p></div></div>
          <div className="editor-grid">
            <label>予算 <span>項目｜金額｜備考</span><textarea value={listValue(plan.budgetItems)} onChange={(event) => onUpdate("budgetItems", toList(event.target.value))} /></label>
            <label>関係諸機関 <span>名称｜連絡先｜用途</span><textarea value={listValue(plan.relatedOrganizations)} onChange={(event) => onUpdate("relatedOrganizations", toList(event.target.value))} /></label>
          </div>
        </section>

        <section className="editor-section">
          <div className="section-title"><span>05</span><div><h2>概念図 <em className="source-badge yamareco">ヤマレコ</em></h2><p>ヤマレコのルート地図スクリーンショットをWordへ貼付</p></div></div>
          {plan.routeMapUrl ? <div className="route-map"><iframe src={plan.routeMapUrl} title="ヤマレコのルート概念図" /><a href={plan.routeMapUrl} rel="noreferrer" target="_blank">ヤマレコでルート地図を開く<ExternalLink size={15} /></a></div> : null}
          <ScreenshotPicker
            files={routeMapImage ? [routeMapImage] : []}
            label="ルート地図のスクリーンショット"
            onFiles={(files) => setRouteMapImage(files[0] ?? null)}
            onRemove={() => setRouteMapImage(null)}
          />
        </section>
      </article>
      <aside className="sources-card">
        <div className="word-card">
          <div className="word-card-heading">
            <FileText size={22} />
            <div><strong>Word計画書を作成</strong><p>見本の5ページ書式をアプリに内蔵</p></div>
          </div>
          <div className="template-status"><CheckCircle2 size={18} /><span><strong>標準書式</strong><small>準備済み・選択操作は不要</small></span></div>
          <div className="word-actions">
            <button className="outline-button" disabled={previewBusy} onClick={previewWord} type="button"><Eye size={17} />{previewBusy ? "作成中" : "Wordプレビュー"}</button>
            <button className="primary-small" disabled={wordBusy} onClick={downloadWord} type="button"><Download size={17} />{wordBusy ? "作成中" : "Word作成"}</button>
          </div>
          {wordError ? <p className="word-error" role="alert">{wordError}</p> : null}
          <p className="word-privacy"><LockKeyhole size={14} />画像の合成とWord生成は、このブラウザ内で完結します。</p>
        </div>
        <div className="manual-card">
          <LockKeyhole size={20} />
          <div><strong>Wordへ人が追記</strong><p>水場情報／食糧／緊急時対策／装備／執筆者／メンバー・役割／連絡網</p></div>
        </div>
        <h2>参照元</h2>
        <p>リンクを開き、最新情報と原文を必ず確認してください。</p>
        <div>
          {plan.sources.map((source) => (
            <a href={source.url} key={`${source.title}-${source.url}`} rel="noreferrer" target="_blank">
              <span>{source.title}</span><ExternalLink size={17} />
            </a>
          ))}
        </div>
      </aside>
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
  document,
  onClose,
}: {
  document: Uint8Array;
  onClose: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function renderDocument() {
      if (!container.current) return;
      container.current.replaceChildren();
      try {
        const { renderAsync } = await import("docx-preview");
        await renderAsync(document, container.current, undefined, {
          breakPages: true,
          ignoreHeight: false,
          ignoreWidth: false,
          inWrapper: true,
          useBase64URL: true,
        });
      } catch (reason) {
        if (!cancelled) setRenderError(reason instanceof Error ? reason.message : "Wordを表示できませんでした。");
      }
    }
    void renderDocument();
    return () => { cancelled = true; };
  }, [document]);

  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Word出力プレビュー">
      <div className="preview-window">
        <div className="preview-window-toolbar">
          <div><strong>Word出力プレビュー</strong><span>アプリ内蔵の標準書式で出力します</span></div>
          <button aria-label="プレビューを閉じる" onClick={onClose} type="button"><X size={22} /></button>
        </div>
        <div className="preview-scroll">
          {renderError ? <div className="word-render-error" role="alert">{renderError}</div> : null}
          <div className="docx-renderer" ref={container} />
        </div>
      </div>
    </div>
  );
}
