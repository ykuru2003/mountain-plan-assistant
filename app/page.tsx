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
  Save,
  Search,
  ShieldCheck,
  Route,
  Upload,
  X,
} from "lucide-react";
import { type ClipboardEvent, useEffect, useMemo, useState } from "react";
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

function planToMarkdown(plan: Plan) {
  const bullets = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  return `# ${plan.title}\n\n## 基本情報\n- 日程：${plan.dates}\n- 山域：${plan.area}\n- 山行目的：${plan.purpose}\n- 集合：${plan.meeting}\n- 解散：${plan.dismissal}\n- 入山地点：${plan.entryPoint}\n- 下山地点：${plan.exitPoint}\n\n## 日別ルート\n${bullets(plan.schedule)}\n\n- コースタイム倍率：${plan.courseTimeMultiplier}\n- 日の入り：${plan.sunset}\n\n## 交通機関（新宿起点）\n${plan.transport}\n\n## テント場・山小屋\n${plan.lodging}\n${plan.lodgingLinks.map((source) => `- [${source.title}](${source.url})`).join("\n")}\n\n## 予算（新宿起点）\n${bullets(plan.budgetItems)}\n\n## 関係諸機関（公開情報）\n${bullets(plan.relatedOrganizations)}\n\n## 概念図\n- [ヤマレコのルート地図](${plan.routeMapUrl})\n\n## 時刻表\n${bullets(plan.timetables)}\n\n## Wordで人が手動記入する項目\n- 水場情報・食糧計画・緊急時対策\n- 共同装備・個人装備\n- 執筆者・メンバー・連絡網\n\n## 参照元\n${plan.sources.map((source) => `- [${source.title}](${source.url})`).join("\n")}\n`;
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
    const saved = window.localStorage.getItem("mountain-plan-draft");
    if (!saved) return;
    try {
      const draft = JSON.parse(saved) as { url?: string; plan?: Plan };
      const restore = window.setTimeout(() => {
        setUrl(draft.url ?? "");
        if (draft.plan?.title) {
          setPlan(normalizePlan(draft.plan));
          setStatus("review");
        }
      }, 0);
      return () => window.clearTimeout(restore);
    } catch {
      window.localStorage.removeItem("mountain-plan-draft");
    }
  }, []);

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
      window.localStorage.setItem("mountain-plan-draft", JSON.stringify({ url, plan: normalized }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "計画書案を作成できませんでした。");
      setStatus("input");
    }
  }

  function updatePlan<K extends keyof Plan>(key: K, value: Plan[K]) {
    setPlan((current) => ({ ...current, [key]: value }));
  }

  function saveDraft() {
    window.localStorage.setItem("mountain-plan-draft", JSON.stringify({ url, plan }));
    setNotice("この端末に下書きを保存しました。");
  }

  function downloadMarkdown() {
    const blob = new Blob([planToMarkdown(plan)], { type: "text/markdown;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${plan.title || "登山計画書"}.md`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  const activeStep = status === "review" ? 3 : status === "generating" ? 2 : 1;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="登山計画書 Field Desk トップ">
          <span className="brand-mark"><Mountain size={28} strokeWidth={2.4} /></span>
          <span className="brand-copy"><strong>登山計画書</strong><small>FIELD DESK</small></span>
        </a>
        <nav className="header-actions" aria-label="補助メニュー">
          <a href="#guide"><HelpCircle size={19} />使い方</a>
          <span className="public-chip"><ShieldCheck size={19} />PUBLIC DATA / LOCAL DOCX</span>
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
            onSave={saveDraft}
            onDownload={downloadMarkdown}
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
          <div><strong>指定Wordへ安全に追記</strong><p>公開情報を確認・修正し、地図と時刻表のスクリーンショットを貼り付けたあと、指定のWordへ出力できます。水場情報、食糧、緊急時対策、装備、個人情報の欄は変更しません。</p></div>
        </section>
      </div>
    </main>
  );
}

function ReviewView({
  plan,
  notice,
  onBack,
  onSave,
  onDownload,
  onUpdate,
}: {
  plan: Plan;
  notice: string;
  onBack: () => void;
  onSave: () => void;
  onDownload: () => void;
  onUpdate: <K extends keyof Plan>(key: K, value: Plan[K]) => void;
}) {
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [wordError, setWordError] = useState("");
  const [wordBusy, setWordBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
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

  async function downloadWord() {
    if (!templateFile) {
      setWordError("先に、送っていただいた形式のWordテンプレートを選択してください。");
      return;
    }
    setWordBusy(true);
    setWordError("");
    try {
      const toWordImage = async (file: File): Promise<WordImage> => ({
        bytes: new Uint8Array(await file.arrayBuffer()),
        extension: file.type === "image/png" ? "png" : "jpg",
        contentType: file.type === "image/png" ? "image/png" : "image/jpeg",
      });
      const output = fillWordTemplate(await templateFile.arrayBuffer(), plan, {
        routeMap: routeMapImage ? await toWordImage(routeMapImage) : undefined,
        timetables: await Promise.all(timetableImages.map(toWordImage)),
      });
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
        <div>
          <button className="outline-button" onClick={onSave} type="button"><Save size={18} />下書き保存</button>
          <button className="primary-small" onClick={onDownload} type="button"><Download size={18} />Markdown保存</button>
        </div>
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      <article className="plan-editor">
        <div className="editor-heading"><span>PLAN WORKSHEET</span><small>指定Wordテンプレート対応</small></div>
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
            <div><strong>Wordテンプレートへ追記</strong><p>処理はこのブラウザ内で完結します</p></div>
          </div>
          <label className="template-picker">
            <Upload size={17} />
            <span>{templateFile ? templateFile.name : "テンプレートを選択"}</span>
            <input
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setTemplateFile(file);
                setWordError("");
              }}
              type="file"
            />
          </label>
          <div className="word-actions">
            <button className="outline-button" onClick={() => setPreviewOpen(true)} type="button"><Eye size={17} />プレビュー</button>
            <button className="primary-small" disabled={wordBusy} onClick={downloadWord} type="button"><Download size={17} />{wordBusy ? "作成中" : "Word作成"}</button>
          </div>
          {wordError ? <p className="word-error" role="alert">{wordError}</p> : null}
          <p className="word-privacy"><LockKeyhole size={14} />テンプレート、氏名、連絡先はサーバーへ送信しません。</p>
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
      {previewOpen ? <WordPreview plan={plan} routeMapImage={routeMapImage} timetableImages={timetableImages} onClose={() => setPreviewOpen(false)} /> : null}
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
  plan,
  routeMapImage,
  timetableImages,
  onClose,
}: {
  plan: Plan;
  routeMapImage: File | null;
  timetableImages: File[];
  onClose: () => void;
}) {
  return (
    <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="Word出力プレビュー">
      <div className="preview-window">
        <div className="preview-window-toolbar">
          <div><strong>Word出力プレビュー</strong><span>実際の書式は選択したテンプレートを保持します</span></div>
          <button aria-label="プレビューを閉じる" onClick={onClose} type="button"><X size={22} /></button>
        </div>
        <div className="preview-scroll">
          <article className="word-page">
            <h1>{plan.title || "泊まり山行計画書"}</h1>
            <table><tbody>
              <tr><th>日程</th><td>{plan.dates}</td><th>山域</th><td>{plan.area}</td></tr>
              <tr><th>山行目的</th><td colSpan={3}>{plan.purpose}</td></tr>
              <tr><th>集合</th><td>{plan.meeting}</td><th>解散</th><td>{plan.dismissal}</td></tr>
              <tr><th>入山地点</th><td>{plan.entryPoint}</td><th>下山地点</th><td>{plan.exitPoint}</td></tr>
              <tr><th>行動予定</th><td colSpan={3}>{plan.schedule.map((item) => <p key={item}>{item}</p>)}</td></tr>
              <tr><th>備考</th><td colSpan={3}>
                <p>コースタイム倍率：{plan.courseTimeMultiplier}</p><p>日没：{plan.sunset}</p>
                <p>交通：{plan.transport}</p><p>宿泊：{plan.lodging}</p>
                {plan.lodgingLinks.map((item) => <p key={item.url}>宿泊地URL：<a href={item.url} rel="noreferrer" target="_blank">{item.title}</a></p>)}
              </td></tr>
            </tbody></table>
          </article>
          <article className="word-page">
            <h2>安全・予算・関係諸機関</h2>
            <table><tbody>
              <tr><th>予算</th><td>{plan.budgetItems.map((item) => <p key={item}>{item}</p>)}</td></tr>
              <tr><th>関係諸機関</th><td>{plan.relatedOrganizations.map((item) => <p key={item}>{item}</p>)}</td></tr>
            </tbody></table>
            <h2>概念図</h2>
            {routeMapImage ? <div className="preview-pasted-image"><FileImagePreview file={routeMapImage} alt="ルート概念図" /></div> : plan.routeMapUrl ? <div className="preview-map"><iframe src={plan.routeMapUrl} title="ルート概念図プレビュー" /><a href={plan.routeMapUrl} rel="noreferrer" target="_blank">ヤマレコで開く<ExternalLink size={14} /></a></div> : <p>ルート地図のスクリーンショットがありません。</p>}
            <h2>時刻表など</h2>
            {timetableImages.length ? timetableImages.map((file, index) => <div className="preview-pasted-image" key={`${file.name}-${index}`}><FileImagePreview file={file} alt={`時刻表 ${index + 1}`} /></div>) : <p>時刻表のスクリーンショットがありません。</p>}
          </article>
        </div>
      </div>
    </div>
  );
}
