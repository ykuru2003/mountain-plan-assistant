export type UsageHistoryItem = {
  url: string;
  title: string;
  usedAt: string;
};

const STORAGE_KEY = "yamareco-research-history";
const MAX_ITEMS = 12;
const LEGACY_TITLES = new Set(["手入力用の山行情報", "名称未取得の山行情報"]);

export function readUsageHistory(): UsageHistoryItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UsageHistoryItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.url === "string" && typeof item.title === "string" && typeof item.usedAt === "string")
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function writeUsageHistory(items: UsageHistoryItem[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // 履歴保存に失敗しても、情報取得の本体は止めない。
  }
}

export function upsertUsageHistory(items: UsageHistoryItem[], item: UsageHistoryItem) {
  return [item, ...items.filter((current) => current.url !== item.url)].slice(0, MAX_ITEMS);
}

export function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  });
}

export async function fetchPublicPlanTitle(url: string) {
  const response = await fetch(`/api/generate?url=${encodeURIComponent(url)}`, { cache: "no-store" });
  const data = await response.json() as { title?: string; error?: string };
  if (!response.ok) throw new Error(data.error || "計画名を取得できませんでした。");
  return data.title?.trim() ?? "";
}

export async function refreshLegacyHistory(items: UsageHistoryItem[]) {
  const legacyItems = items.filter((item) => LEGACY_TITLES.has(item.title));
  if (!legacyItems.length) return items;
  const resolved = await Promise.all(legacyItems.map(async (item) => {
    try {
      return [item.url, await fetchPublicPlanTitle(item.url)] as const;
    } catch {
      return [item.url, ""] as const;
    }
  }));
  const titles = new Map(resolved.filter(([, title]) => title));
  if (!titles.size) return items;
  return items.map((item) => ({ ...item, title: titles.get(item.url) || item.title }));
}
