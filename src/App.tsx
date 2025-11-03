import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * KitchenMate NZ — MVP 可运行原型（两周最小可用集）
 * 单文件可跑：Next.js/CRA 皆可用（作为 src/index.tsx 或 app/page.tsx 的组件内容）。
 * Pages: Home / Recipes / Inventory / Plan / List
 * Storage: localStorage 持久化（无需后端）
 * Highlights:
 *  - 菜谱管理：录入/收藏、份量缩放、标签、复刻模式
 *  - 冰箱库存：到期/临期提醒、三栏视图、快用掉清单
 *  - 购物清单：从菜谱生成、合并同名、预算估算、勾选已购写回库存
 *  - 带饭助手：一键“带明日午餐”，自动放大份量
 *  - 倒计时提醒：解冻/泡发/淘米/开煮 逐步勾选；ICS 导出 + 浏览器通知
 *  - 学生预算：每周预算进度条（可设置）
 *  - Auckland 时区友好（ICS 使用本地时间）
 */

// ----------------------------- 类型定义 -----------------------------

type Unit =
  | "g"
  | "kg"
  | "ml"
  | "L"
  | "个"
  | "颗"
  | "包"
  | "罐"
  | "片"
  | "瓣"
  | "份"
  | "袋"
  | "盒"
  | "条"
  | "其他";

type Location = "冷藏" | "冷冻" | "干货";

type Difficulty = "easy" | "normal" | "hard";

type ReminderType = "defrost" | "soak" | "rinse_rice" | "start_cooking";

type CuisineTag = "CN" | "JP" | "IT" | "TH" | "Other";

interface Ingredient {
  name: string;
  qty?: number;
  unit?: Unit;
  requiresDefrost?: boolean;
  requiresSoakMin?: number;
  isRice?: boolean;
}

interface Recipe {
  id: string;
  title: string;
  cuisine?: CuisineTag;
  difficulty?: Difficulty;
  cookTimeMin?: number;
  packable?: boolean;
  notes?: string;
  servings?: number;
  imageUrl?: string;
  tags?: string[];
  ingredients: Ingredient[];
  steps?: { text: string; prepHint?: string; timerMin?: number }[];
  lastCookedAt?: number;
  lastServings?: number;
  lastNotes?: string;
  favorite?: boolean;
}

interface InventoryItem {
  id: string;
  ingredient: string;
  qty: number;
  unit: Unit;
  location: Location;
  purchasedAt?: number;
  expiresAt?: number;
  unitPrice?: number;
}

interface ShoppingListItem {
  id: string;
  ingredient: string;
  qty: number;
  unit: Unit;
  estPrice?: number;
  checked?: boolean;
  location?: Location;
}

interface MealPlan {
  id: string;
  date: string;
  time: string;
  recipeId: string;
  servings: number;
  includeLunchNextDay?: boolean;
  reminders?: Reminder[];
}

interface Reminder {
  id: string;
  label: string;
  type: ReminderType;
  dueAt: number;
  done: boolean;
  locked: boolean;
}

// ----------------------------- Demo 数据 -----------------------------

const DEMO_RECIPES: Recipe[] = [
  {
    id: "r1",
    title: "照烧鸡腿饭 (Teriyaki Chicken Bowl)",
    cuisine: "JP",
    difficulty: "easy",
    cookTimeMin: 35,
    packable: true,
    servings: 2,
    notes: "鸡腿去骨更好煎，酱汁收紧再起锅。",
    imageUrl:
      "https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=1200&auto=format&fit=crop",
    ingredients: [
      { name: "鸡腿肉", qty: 400, unit: "g", requiresDefrost: true },
      { name: "酱油", qty: 40, unit: "ml" },
      { name: "味醂", qty: 20, unit: "ml" },
      { name: "糖", qty: 10, unit: "g" },
      { name: "大米", qty: 200, unit: "g", isRice: true },
      { name: "西兰花", qty: 200, unit: "g" },
    ],
    steps: [
      { text: "米洗净浸泡20分钟；鸡腿擦干备用", prepHint: "淘米20min", timerMin: 20 },
      { text: "煎鸡腿至两面上色，加入酱汁收汁" },
      { text: "焯西兰花，装盘配饭" },
    ],
  },
  {
    id: "r2",
    title: "香菇鸡汤 (Chicken Soup with Dried Shiitake)",
    cuisine: "CN",
    difficulty: "normal",
    cookTimeMin: 60,
    packable: true,
    servings: 3,
    notes: "干香菇需提前泡发，汤里少许盐提鲜。",
    imageUrl:
      "https://images.unsplash.com/photo-1512058454905-6b0f00f65579?q=80&w=1200&auto=format&fit=crop",
    ingredients: [
      { name: "鸡腿肉", qty: 500, unit: "g", requiresDefrost: true },
      { name: "干香菇", qty: 6, unit: "个", requiresSoakMin: 90 },
      { name: "姜片", qty: 6, unit: "片" },
      { name: "盐", qty: 3, unit: "g" },
    ],
  },
  {
    id: "r3",
    title: "番茄金枪鱼意面 (Tuna Tomato Pasta)",
    cuisine: "IT",
    difficulty: "easy",
    cookTimeMin: 20,
    packable: true,
    servings: 2,
    notes: "保命快手餐：罐头+番茄，10分钟出锅。",
    imageUrl:
      "https://images.unsplash.com/photo-1528736235302-52922df5c122?q=80&w=1200&auto=format&fit=crop",
    ingredients: [
      { name: "意面", qty: 200, unit: "g" },
      { name: "金枪鱼罐头", qty: 1, unit: "罐" },
      { name: "番茄碎", qty: 400, unit: "g" },
      { name: "蒜末", qty: 2, unit: "瓣" },
    ],
  },
  {
    id: "r4",
    title: "咖喱鸡 (Curry Chicken)",
    cuisine: "TH",
    difficulty: "normal",
    cookTimeMin: 45,
    packable: true,
    servings: 3,
    imageUrl:
      "https://images.unsplash.com/photo-1604908177078-4b2b2c5b2a4d?q=80&w=1200&auto=format&fit=crop",
    ingredients: [
      { name: "鸡胸肉", qty: 500, unit: "g", requiresDefrost: true },
      { name: "土豆", qty: 2, unit: "个" },
      { name: "胡萝卜", qty: 1, unit: "个" },
      { name: "咖喱块", qty: 120, unit: "g" },
      { name: "椰奶", qty: 400, unit: "ml" },
      { name: "大米", qty: 225, unit: "g", isRice: true },
    ],
  },
];

const DEMO_INVENTORY: InventoryItem[] = [
  {
    id: sid(),
    ingredient: "鸡腿肉",
    qty: 300,
    unit: "g",
    location: "冷冻",
    purchasedAt: daysFromNow(-5),
    expiresAt: daysFromNow(60),
    unitPrice: 0.012,
  },
  {
    id: sid(),
    ingredient: "大米",
    qty: 1000,
    unit: "g",
    location: "干货",
    purchasedAt: daysFromNow(-10),
    expiresAt: daysFromNow(180),
    unitPrice: 0.003,
  },
  {
    id: sid(),
    ingredient: "西兰花",
    qty: 1,
    unit: "颗",
    location: "冷藏",
    purchasedAt: daysFromNow(-1),
    expiresAt: daysFromNow(3),
    unitPrice: 2.5,
  },
  {
    id: sid(),
    ingredient: "干香菇",
    qty: 12,
    unit: "个",
    location: "干货",
    purchasedAt: daysFromNow(-20),
    expiresAt: daysFromNow(365),
    unitPrice: 0.4,
  },
  {
    id: sid(),
    ingredient: "意面",
    qty: 500,
    unit: "g",
    location: "干货",
    purchasedAt: daysFromNow(-15),
    expiresAt: daysFromNow(240),
    unitPrice: 0.006,
  },
];

// ----------------------------- 小工具 -----------------------------

function sid() {
  return Math.random().toString(36).slice(2, 10);
}

function daysFromNow(d: number) {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(12, 0, 0, 0);
  return t.getTime();
}

function fmtDate(ts?: number) {
  if (!ts) return "";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateTime(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalDateTime(date: string, time: string) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date();
  dt.setFullYear(y, m - 1, d);
  dt.setHours(hh, mm, 0, 0);
  return dt.getTime();
}

function minutesBefore(ts: number, minutes: number) {
  return ts - minutes * 60 * 1000;
}

function prevDay21(ts: number) {
  const d = new Date(ts);
  d.setDate(d.getDate() - 1);
  d.setHours(21, 0, 0, 0);
  return d.getTime();
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "到点啦";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}小时 ${m}分 ${sec}秒`;
  if (m > 0) return `${m}分 ${sec}秒`;
  return `${sec}秒`;
}

function supportsNotification() {
  return typeof window !== "undefined" && "Notification" in window;
}
async function requestNotifyPermission() {
  if (!supportsNotification()) return "denied" as NotificationPermission;
  if (Notification.permission === "granted") return "granted";
  return await Notification.requestPermission();
}
function notifyNow(title: string, body?: string) {
  if (!supportsNotification()) return;
  if (Notification.permission === "granted") {
    const n = new Notification(title, { body });
    setTimeout(() => n.close(), 8000);
  }
}

function mergeList(items: ShoppingListItem[]): ShoppingListItem[] {
  const map = new Map<string, ShoppingListItem>();
  for (const it of items) {
    const key = `${it.ingredient}|${it.unit}`;
    const existed = map.get(key);
    if (existed) {
      existed.qty += it.qty;
      existed.estPrice = (existed.estPrice || 0) + (it.estPrice || 0);
      existed.checked = Boolean(existed.checked && it.checked);
    } else {
      map.set(key, { ...it });
    }
  }
  return Array.from(map.values());
}

function classNames(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ----------------------------- LocalStorage Hook -----------------------------

function useLocalStore<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState] as const;
}

// ----------------------------- 智能提醒生成 -----------------------------

function generateReminders(recipe: Recipe, cookAt: number): Reminder[] {
  const reminders: Reminder[] = [];
  const hasFrozen = recipe.ingredients.some((i) => i.requiresDefrost);
  const soakIng = recipe.ingredients.find((i) => typeof i.requiresSoakMin === "number");
  const hasRice = recipe.ingredients.some((i) => i.isRice);

  if (hasFrozen) {
    let due = prevDay21(cookAt);
    if (due < Date.now()) due = Date.now() + 5 * 60 * 1000;
    reminders.push({
      id: sid(),
      label: "解冻冷冻食材",
      type: "defrost",
      dueAt: due,
      done: false,
      locked: false,
    });
  }
  if (soakIng) {
    const soakMin = clamp(soakIng.requiresSoakMin || 90, 60, 120);
    const due = minutesBefore(cookAt, soakMin);
    reminders.push({
      id: sid(),
      label: `泡发干货（约${soakMin}分钟）`,
      type: "soak",
      dueAt: due,
      done: false,
      locked: false,
    });
  }
  if (hasRice) {
    const due = minutesBefore(cookAt, 20);
    reminders.push({
      id: sid(),
      label: "淘米并浸泡20分钟",
      type: "rinse_rice",
      dueAt: due,
      done: false,
      locked: false,
    });
  }
  reminders.push({
    id: sid(),
    label: "开始烹饪",
    type: "start_cooking",
    dueAt: cookAt,
    done: false,
    locked: false,
  });

  for (let i = 0; i < reminders.length; i++) reminders[i].locked = i > 0;
  return reminders.sort((a, b) => a.dueAt - b.dueAt);
}

// ----------------------------- ICS 导出 -----------------------------

function dtToICSLocal(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}` +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    "00"
  );
}

function buildICS(reminders: Reminder[], title: string) {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//KitchenMate NZ//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  reminders.forEach((r) => {
    const uid = `${r.id}@kitchenmate`;
    const dtstart = dtToICSLocal(r.dueAt);
    const dtend = dtToICSLocal(r.dueAt + 30 * 60 * 1000);
    const summary = `${title} · ${r.label}`;
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstart}`);
    lines.push(`DTSTART:${dtstart}`);
    lines.push(`DTEND:${dtend}`);
    lines.push(`SUMMARY:${summary.replace(/\n/g, " ")}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ----------------------------- 布局组件 -----------------------------

function GlassPanel({
  children,
  className,
  tone = "light",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "light" | "accent";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 text-white shadow-xl"
      : "bg-white/95 backdrop-blur border border-neutral-200 shadow-sm";
  return (
    <section className={classNames("rounded-3xl p-4 md:p-6", toneClass, className)}>
      {children}
    </section>
  );
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-sm text-neutral-500 mt-1 max-w-xl">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

// ----------------------------- 根组件 -----------------------------

type Route = "home" | "recipes" | "inventory" | "plan" | "list";

type Toast = { id: string; text: string };

export default function KitchenMateApp() {
  const [recipes, setRecipes] = useLocalStore<Recipe[]>("km.recipes", DEMO_RECIPES);
  const [inventory, setInventory] = useLocalStore<InventoryItem[]>(
    "km.inventory",
    DEMO_INVENTORY
  );
  const [list, setList] = useLocalStore<ShoppingListItem[]>("km.list", []);
  const [plans, setPlans] = useLocalStore<MealPlan[]>("km.plans", []);
  const [budgetPerWeek, setBudgetPerWeek] = useLocalStore<number>(
    "km.budget.week",
    80
  );

  const [route, setRoute] = useState<Route>("home");
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [maxTime, setMaxTime] = useState<number>(30);

  useEffect(() => {
    if (supportsNotification()) setPermission(Notification.permission);
  }, []);

  useEffect(() => {
    try {
      runSelfTests();
    } catch (e) {
      console.warn("Self-tests error:", e);
    }
  }, []);

  const notifiedRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const timer = setInterval(() => {
      plans.forEach((p) =>
        (p.reminders || []).forEach((r) => {
          if (!r.done && !notifiedRef.current[r.id] && Date.now() >= r.dueAt) {
            const recipe = recipes.find((x) => x.id === p.recipeId);
            notifyNow("提醒：" + r.label, recipe ? recipe.title : undefined);
            notifiedRef.current[r.id] = true;
          }
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [plans, recipes]);

  const invNotifiedRef = useRef<Record<string, { d3?: boolean; d1?: boolean }>>({});
  useEffect(() => {
    const dayMs = 60 * 1000;
    const timer = setInterval(() => {
      const now = Date.now();
      inventory.forEach((it) => {
        if (!it.expiresAt) return;
        const left = it.expiresAt - now;
        const key = it.id;
        const rec = invNotifiedRef.current[key] || {};
        if (left < 3 * dayMs && !rec.d3) {
          notifyNow("临期提醒（3天内）", `${it.ingredient} · ${it.qty}${it.unit}`);
          rec.d3 = true;
        }
        if (left < 1 * dayMs && !rec.d1) {
          notifyNow("临期提醒（1天内）", `${it.ingredient} · ${it.qty}${it.unit}`);
          rec.d1 = true;
        }
        invNotifiedRef.current[key] = rec;
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [inventory]);

  const suggestions = useMemo(
    () => suggestRecipes(recipes, inventory, maxTime),
    [recipes, inventory, maxTime]
  );

  const stats = useMemo(() => computeStats(recipes, inventory, list, plans), [
    recipes,
    inventory,
    list,
    plans,
  ]);

  function pushToast(text: string) {
    const t = { id: sid(), text };
    setToast(t);
    setTimeout(() => {
      setToast((x) => (x?.id === t.id ? null : x));
    }, 2200);
  }

  function resetDemo() {
    setRecipes(DEMO_RECIPES);
    setInventory(DEMO_INVENTORY);
    setList([]);
    setPlans([]);
    pushToast("已重置Demo数据");
  }

  function enableNotify() {
    requestNotifyPermission().then((p) => setPermission(p));
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-100 via-white to-neutral-200 text-neutral-900">
      <TopNav
        route={route}
        setRoute={setRoute}
        onReset={resetDemo}
        permission={permission}
        enableNotify={enableNotify}
        stats={stats}
      />

      {route === "home" && (
        <HomeView
          q={q}
          setQ={setQ}
          suggestions={suggestions}
          recipes={recipes}
          inventory={inventory}
          plans={plans}
          setRoute={setRoute}
          maxTime={maxTime}
          setMaxTime={setMaxTime}
          stats={stats}
        />
      )}
      {route === "recipes" && (
        <RecipesView
          q={q}
          setQ={setQ}
          recipes={recipes}
          setRecipes={setRecipes}
          inventory={inventory}
          list={list}
          setList={setList}
          plans={plans}
          setPlans={setPlans}
          pushToast={pushToast}
        />
      )}
      {route === "inventory" && (
        <InventoryView
          inventory={inventory}
          setInventory={setInventory}
          pushToast={pushToast}
        />
      )}
      {route === "plan" && (
        <PlanView
          recipes={recipes}
          plans={plans}
          setPlans={setPlans}
        />
      )}
      {route === "list" && (
        <ListView
          list={list}
          setList={setList}
          inventory={inventory}
          setInventory={setInventory}
          budgetPerWeek={budgetPerWeek}
          setBudgetPerWeek={setBudgetPerWeek}
          pushToast={pushToast}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function computeStats(
  recipes: Recipe[],
  inventory: InventoryItem[],
  list: ShoppingListItem[],
  plans: MealPlan[]
) {
  const expiringSoon = getExpiringItems(inventory).filter((x) =>
    x.expiresAt ? x.expiresAt - Date.now() < 3 * 86400000 : false
  );
  const checkedCost = list
    .filter((i) => i.checked)
    .reduce((acc, cur) => acc + (cur.estPrice || 0), 0);
  return {
    recipes: recipes.length,
    inventory: inventory.length,
    expiringSoon: expiringSoon.length,
    plans: plans.length,
    checklistCost: round2(checkedCost),
  };
}

// ----------------------------- 顶部导航 -----------------------------

function TopNav({
  route,
  setRoute,
  onReset,
  permission,
  enableNotify,
  stats,
}: {
  route: Route;
  setRoute: (r: Route) => void;
  onReset: () => void;
  permission: NotificationPermission;
  enableNotify: () => void;
  stats: ReturnType<typeof computeStats>;
}) {
  const [open, setOpen] = useState(false);
  const links: { key: Route; label: string; emoji: string }[] = [
    { key: "home", label: "Home", emoji: "🏠" },
    { key: "recipes", label: "Recipes", emoji: "📖" },
    { key: "inventory", label: "Inventory", emoji: "🧊" },
    { key: "plan", label: "Plan", emoji: "🗓️" },
    { key: "list", label: "List", emoji: "🧾" },
  ];

  useEffect(() => {
    const handler = () => setOpen(false);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-white/85 backdrop-blur shadow-sm border-b border-neutral-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">KitchenMate NZ</span>
          <span className="hidden sm:inline text-xs text-neutral-500">做饭不纠结 · 用完不浪费</span>
          <div className="hidden md:flex items-center gap-3 text-xs text-neutral-500">
            <span>菜谱 {stats.recipes}</span>
            <span>库存 {stats.inventory}</span>
            <span>临期 {stats.expiringSoon}</span>
            <span>计划 {stats.plans}</span>
          </div>
        </div>
        <nav className="hidden md:flex items-center gap-2">
          {links.map((l) => (
            <button
              key={l.key}
              onClick={() => setRoute(l.key)}
              className={classNames(
                "px-3 py-1.5 rounded-xl text-sm font-medium transition",
                route === l.key
                  ? "bg-neutral-900 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
              )}
            >
              <span className="mr-1 text-base">{l.emoji}</span>
              {l.label}
            </button>
          ))}
          <button
            onClick={onReset}
            className="ml-2 px-3 py-1.5 rounded-xl text-sm border border-neutral-200 hover:bg-neutral-100"
          >
            重置Demo
          </button>
          <button
            onClick={enableNotify}
            className={classNames(
              "px-3 py-1.5 rounded-xl text-sm font-medium",
              permission === "granted"
                ? "bg-green-600 text-white"
                : "bg-neutral-900 text-white hover:bg-neutral-800"
            )}
          >
            {permission === "granted" ? "通知已开" : "开启通知"}
          </button>
        </nav>
        <div className="md:hidden flex items-center gap-2">
          <button
            onClick={enableNotify}
            className={classNames(
              "px-3 py-1.5 rounded-xl text-sm",
              permission === "granted"
                ? "bg-green-600 text-white"
                : "bg-neutral-900 text-white"
            )}
          >
            {permission === "granted" ? "通知已开" : "通知"}
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-2 rounded-xl border border-neutral-200"
          >
            ☰
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-neutral-200 bg-white/95 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2">
            {links.map((l) => (
              <button
                key={l.key}
                onClick={() => {
                  setRoute(l.key);
                  setOpen(false);
                }}
                className={classNames(
                  "px-3 py-2 rounded-xl text-left text-sm",
                  route === l.key
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-700"
                )}
              >
                <span className="mr-2">{l.emoji}</span>
                {l.label}
              </button>
            ))}
            <button
              onClick={() => {
                onReset();
                setOpen(false);
              }}
              className="px-3 py-2 rounded-xl bg-neutral-100 text-left text-sm"
            >
              重置Demo
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

// ----------------------------- Home -----------------------------

function HomeView({
  q,
  setQ,
  suggestions,
  recipes,
  inventory,
  plans,
  setRoute,
  maxTime,
  setMaxTime,
  stats,
}: {
  q: string;
  setQ: (s: string) => void;
  suggestions: Recipe[];
  recipes: Recipe[];
  inventory: InventoryItem[];
  plans: MealPlan[];
  setRoute: (r: Route) => void;
  maxTime: number;
  setMaxTime: (n: number) => void;
  stats: ReturnType<typeof computeStats>;
}) {
  const expiring = useMemo(() => getExpiringItems(inventory).slice(0, 5), [
    inventory,
  ]);
  const plannedToday = useMemo(() => getTodayPlans(recipes, plans), [
    recipes,
    plans,
  ]);

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <GlassPanel tone="accent" className="relative overflow-hidden">
        <HeroPattern />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <p className="uppercase tracking-[0.35em] text-xs text-neutral-300">KitchenMate Dashboard</p>
            <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
              晚餐灵感、库存掌控与预算规划，一站式完成。
            </h1>
            <p className="text-sm text-neutral-200 max-w-xl">
              根据你的储藏和临期提醒，自动推荐今夜菜单。同步购物清单与倒计时提醒，再也不忘记解冻。
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-neutral-200">
              <QuickStat label="菜谱" value={stats.recipes} icon="📖" />
              <QuickStat label="库存" value={stats.inventory} icon="🧊" />
              <QuickStat label="临期" value={stats.expiringSoon} icon="⏰" highlight />
              <QuickStat label="已购预算" value={`$${stats.checklistCost}`} icon="💰" />
            </div>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 md:p-6 shadow-lg backdrop-blur w-full lg:w-80">
            <SectionTitle
              title="今晚吃什么"
              subtitle="基于库存/临期/时间的个性化推荐"
            />
            <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-300">
              <span>最长期限</span>
              <select
                value={maxTime}
                onChange={(e) => setMaxTime(parseInt(e.target.value))}
                className="px-3 py-1.5 rounded-xl bg-white/20 border border-white/30 text-white focus:outline-none"
              >
                {[20, 30, 45, 60].map((n) => (
                  <option key={n} value={n} className="text-neutral-900">
                    {n} 分钟
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 space-y-3">
              {suggestions.map((r) => (
                <RecipeCardSmall key={r.id} recipe={r} onOpen={() => setRoute("recipes")} />
              ))}
              {suggestions.length === 0 && (
                <p className="text-xs text-neutral-200">
                  暂无符合条件的推荐，可以适当放宽烹饪时间或补充库存。
                </p>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>

      <div className="grid lg:grid-cols-3 gap-6">
        <GlassPanel className="lg:col-span-2">
          <SectionTitle title="临期优先用掉" subtitle="优先处理即将到期的食材，减少浪费" />
          <ul className="mt-4 grid md:grid-cols-2 xl:grid-cols-3 gap-3 text-sm">
            {expiring.map((it) => (
              <li
                key={it.id}
                className="p-4 rounded-2xl border border-white/40 bg-gradient-to-br from-orange-50 to-white flex items-center justify-between shadow-sm"
              >
                <span className="font-medium text-neutral-700">
                  • {it.ingredient} · {it.qty}
                  {it.unit}
                </span>
                <span className="text-xs text-orange-600">到期 {fmtDate(it.expiresAt)}</span>
              </li>
            ))}
            {expiring.length === 0 && (
              <li className="p-4 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 text-sm">
                恭喜！暂无临期食材。
              </li>
            )}
          </ul>
        </GlassPanel>
        <GlassPanel className="space-y-4">
          <SectionTitle title="今日清单" subtitle="带饭助手与库存待办" />
          <div className="space-y-3 text-sm">
            {plannedToday.length > 0 ? (
              plannedToday.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-2xl border border-neutral-200 bg-white flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-neutral-500">预计 {item.time} · {item.servings} 份</div>
                  </div>
                  <button
                    onClick={() => setRoute("plan")}
                    className="text-xs px-3 py-1.5 rounded-xl bg-neutral-900 text-white"
                  >
                    查看
                  </button>
                </div>
              ))
            ) : (
              <p className="text-xs text-neutral-500">今天还没有计划，去菜谱页挑选喜欢的菜吧。</p>
            )}
          </div>
        </GlassPanel>
      </div>

      <GlassPanel>
        <SectionTitle
          title="快速找菜谱"
          subtitle="搜索菜名、食材或菜系，一键跳转到菜谱页"
          action={
            <button
              onClick={() => setRoute("recipes")}
              className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm"
            >
              去菜谱
            </button>
          }
        />
        <div className="flex gap-2 mt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索菜名 / 食材"
            className="flex-1 px-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          />
        </div>
      </GlassPanel>
    </main>
  );
}

function HeroPattern() {
  return (
    <div className="absolute inset-0 opacity-30">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.4),_transparent_55%)]" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.25),_transparent_60%)]" />
      <div className="absolute inset-y-0 left-0 w-1/2 bg-[linear-gradient(135deg,_rgba(255,255,255,0.15),_transparent_70%)]" />
    </div>
  );
}

function QuickStat({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number | string;
  icon: string;
  highlight?: boolean;
}) {
  return (
    <span
      className={classNames(
        "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium",
        highlight ? "bg-white/20 text-white" : "bg-white/10 text-neutral-100"
      )}
    >
      <span>{icon}</span>
      {label} {value}
    </span>
  );
}

function RecipeCardSmall({ recipe, onOpen }: { recipe: Recipe; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left border border-white/30 bg-white/15 backdrop-blur rounded-2xl p-3 hover:bg-white/30 transition"
    >
      {recipe.imageUrl && (
        <div className="relative h-24 w-full overflow-hidden rounded-xl">
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute bottom-2 left-2 text-[10px] text-white uppercase tracking-wider">
            {recipe.cuisine || ""}
          </div>
        </div>
      )}
      <div className="font-medium mt-2 text-sm text-white">{recipe.title}</div>
      <div className="text-[11px] text-neutral-200 mt-1">
        约 {recipe.cookTimeMin || 20} 分钟 · {recipe.packable ? "适合带饭" : "适合家庭"}
      </div>
      <div className="text-[11px] text-neutral-300 mt-1 line-clamp-2">{recipe.notes}</div>
    </button>
  );
}

function getExpiringItems(inv: InventoryItem[]) {
  return [...inv]
    .filter((i) => i.expiresAt)
    .sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
}

function getTodayPlans(recipes: Recipe[], plans: MealPlan[]) {
  const today = fmtDate(Date.now());
  return plans
    .filter((p) => p.date === today)
    .map((p) => ({
      ...p,
      title: recipes.find((r) => r.id === p.recipeId)?.title || "[已删除菜谱]",
    }));
}

function suggestRecipes(recipes: Recipe[], inv: InventoryItem[], maxTime: number) {
  const now = Date.now();
  const nearSet = new Set(
    getExpiringItems(inv)
      .filter((x) => (x.expiresAt || 0) - now < 3 * 86400000)
      .map((x) => x.ingredient)
  );
  const availMap = new Map<string, { qty: number; unit: Unit }>();
  inv.forEach((i) => availMap.set(i.ingredient, { qty: i.qty, unit: i.unit }));

  const scored = recipes
    .filter((r) => (r.cookTimeMin || 999) <= maxTime)
    .map((r) => {
      let cover = 0,
        total = r.ingredients.length;
      let near = 0;
      for (const ig of r.ingredients) {
        const a = availMap.get(ig.name);
        if (a && a.unit === (ig.unit || a.unit) && (a.qty || 0) >= (ig.qty || 0)) cover++;
        if (nearSet.has(ig.name)) near++;
      }
      const coverScore = cover / Math.max(1, total);
      const nearScore = near > 0 ? 0.25 : 0;
      const packScore = r.packable ? 0.2 : 0;
      const timeScore = (r.cookTimeMin || 20) <= 30 ? 0.2 : 0.05;
      return { r, score: coverScore + nearScore + packScore + timeScore };
    });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.r);
}

// ----------------------------- Recipes 页面 -----------------------------

function RecipesView({
  q,
  setQ,
  recipes,
  setRecipes,
  inventory,
  list,
  setList,
  plans,
  setPlans,
  pushToast,
}: {
  q: string;
  setQ: (s: string) => void;
  recipes: Recipe[];
  setRecipes: (rs: Recipe[]) => void;
  inventory: InventoryItem[];
  list: ShoppingListItem[];
  setList: (xs: ShoppingListItem[]) => void;
  plans: MealPlan[];
  setPlans: (ps: MealPlan[]) => void;
  pushToast: (s: string) => void;
}) {
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [servings, setServings] = useState<number>(2);
  const [planDate, setPlanDate] = useState<string>(() => fmtDate(Date.now()));
  const [planTime, setPlanTime] = useState<string>("18:30");
  const [incLunch, setIncLunch] = useState<boolean>(true);

  useEffect(() => {
    if (selected) setServings(selected.servings || 2);
  }, [selected]);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return recipes;
    return recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(k) ||
        (r.cuisine || "").toLowerCase().includes(k) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(k))
    );
  }, [q, recipes]);

  function addToListFromRecipe(r: Recipe) {
    const base = r.servings || 2;
    const required = scaleIngredients(r.ingredients, base, servings);
    const invMap = new Map<string, { qty: number; unit: Unit; price?: number }>();
    inventory.forEach((i) => invMap.set(i.ingredient, { qty: i.qty, unit: i.unit, price: i.unitPrice }));

    let items: ShoppingListItem[] = [];
    for (const ig of required) {
      const av = invMap.get(ig.name);
      let need = ig.qty || 0;
      if (av && av.unit === (ig.unit || av.unit)) need = Math.max(0, (ig.qty || 0) - av.qty);
      if (need > 0) {
        const estUnitPrice = guessUnitPrice(inventory, ig.name);
        items.push({
          id: sid(),
          ingredient: ig.name,
          qty: round2(need),
          unit: (ig.unit || "其他") as Unit,
          estPrice: estUnitPrice ? round2(estUnitPrice * need) : undefined,
          checked: false,
          location: defaultLocationFor(ig.name),
        });
      }
    }
    if (items.length === 0) {
      pushToast("库存已足够，无需采购");
      return;
    }
    const merged = mergeList([...list, ...items]);
    setList(merged);
    pushToast("已加入购物清单");
  }

  function addPlan(r: Recipe) {
    const id = sid();
    const adjustedServings = Math.ceil(servings * (incLunch ? 1.5 : 1));
    const plan: MealPlan = {
      id,
      date: planDate,
      time: planTime,
      recipeId: r.id,
      servings: adjustedServings,
      includeLunchNextDay: incLunch,
    };
    setPlans([...plans, plan]);
    pushToast("已加入计划");
  }

  function saveNewRecipe(r: Recipe) {
    setRecipes([r, ...recipes]);
    pushToast("已新增菜谱");
  }

  function toggleFavorite(id: string) {
    setRecipes((rs) => rs.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)) as any);
  }

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <GlassPanel>
        <SectionTitle
          title="菜谱管理"
          subtitle="收藏喜爱菜谱，按份量自动换算食材，一键加入计划或购物清单"
          action={<RecipeEditor onSave={saveNewRecipe} />}
        />
        <div className="flex flex-col md:flex-row md:items-center gap-3 mt-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索菜名 / 食材 / 菜系"
            className="flex-1 px-4 py-3 rounded-2xl border border-neutral-200 bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
          />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {filtered.map((r) => (
            <div
              key={r.id}
              className="group rounded-3xl border border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-lg transition overflow-hidden"
            >
              <button onClick={() => setSelected(r)} className="block w-full text-left">
                {r.imageUrl && (
                  <div className="relative h-40">
                    <img
                      src={r.imageUrl}
                      alt={r.title}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <span className="absolute bottom-3 left-4 text-white text-sm font-medium">
                      {r.title}
                    </span>
                  </div>
                )}
                <div className="p-4 space-y-2">
                  {!r.imageUrl && <div className="font-semibold text-neutral-800">{r.title}</div>}
                  <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
                    {r.cuisine && <Tag color="gray">{r.cuisine}</Tag>}
                    {r.packable && <Tag color="green">适合带饭</Tag>}
                    <Tag color="blue">{r.difficulty || ""}</Tag>
                    <Tag color="orange">{r.cookTimeMin || 20} 分钟</Tag>
                  </div>
                  <p className="text-xs text-neutral-500 line-clamp-2">{r.notes}</p>
                </div>
              </button>
              <div className="px-4 pb-4 flex items-center justify-between">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(r.id);
                  }}
                  title={r.favorite ? "已收藏" : "收藏"}
                  className={classNames(
                    "px-3 py-1.5 rounded-xl border text-sm",
                    r.favorite
                      ? "bg-yellow-100 border-yellow-200 text-yellow-700"
                      : "border-neutral-200 text-neutral-600"
                  )}
                >
                  {r.favorite ? "★ 已收藏" : "☆ 收藏"}
                </button>
                <button
                  onClick={() => setSelected(r)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-sm"
                >
                  查看
                </button>
              </div>
              {r.lastCookedAt && (
                <div className="mx-4 mb-4 p-3 rounded-2xl bg-green-50 text-xs text-green-700 border border-green-200">
                  复刻：{fmtDateTime(r.lastCookedAt)}（{r.lastServings} 份）
                  {r.lastNotes ? ` · ${r.lastNotes}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      </GlassPanel>

      {selected && (
        <GlassPanel className="space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold">{selected.title}</h3>
              <p className="text-sm text-neutral-500 mt-1">
                自动换算份量，添加计划或一键生成购物清单。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-neutral-600">份量</label>
              <input
                type="number"
                value={servings}
                min={1}
                onChange={(e) => setServings(parseInt(e.target.value || "1"))}
                className="w-20 px-3 py-2 rounded-xl border border-neutral-200 text-sm"
              />
              <label className="text-sm text-neutral-600">日期</label>
              <input
                type="date"
                value={planDate}
                onChange={(e) => setPlanDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-neutral-200 text-sm"
              />
              <label className="text-sm text-neutral-600">时间</label>
              <input
                type="time"
                value={planTime}
                onChange={(e) => setPlanTime(e.target.value)}
                className="px-3 py-2 rounded-xl border border-neutral-200 text-sm"
              />
              <label className="text-sm text-neutral-600 flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={incLunch}
                  onChange={() => setIncLunch(!incLunch)}
                />
                带明日午餐
              </label>
              <button
                onClick={() => addPlan(selected)}
                className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm"
              >
                加入计划
              </button>
              <button
                onClick={() => addToListFromRecipe(selected)}
                className="px-3 py-2 rounded-xl border border-neutral-200 text-sm"
              >
                加入购物清单
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">食材（按{servings}份）</h4>
              <ul className="text-sm space-y-2">
                {scaleIngredients(
                  selected.ingredients,
                  selected.servings || 2,
                  servings
                ).map((ig, idx) => (
                  <li
                    key={idx}
                    className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-2xl border border-neutral-200 bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-700">• {ig.name}</span>
                    {ig.qty ? (
                      <span className="text-neutral-600">{round2(ig.qty)}{ig.unit || ""}</span>
                    ) : null}
                    {ig.requiresDefrost ? <Tag color="orange">需解冻</Tag> : null}
                    {typeof ig.requiresSoakMin === "number" ? (
                      <Tag color="blue">需泡发</Tag>
                    ) : null}
                    {ig.isRice ? <Tag color="green">米饭</Tag> : null}
                  </li>
                ))}
              </ul>
              {selected.steps && selected.steps.length > 0 && (
                <div className="mt-5">
                  <h4 className="font-semibold mb-2">做法</h4>
                  <ol className="list-decimal list-inside text-sm space-y-2 text-neutral-700">
                    {selected.steps.map((s, i) => (
                      <li key={i} className="px-3 py-2 rounded-2xl bg-neutral-50 border border-neutral-200">
                        {s.text}
                        {s.prepHint ? (
                          <span className="ml-2 text-xs text-neutral-500">（{s.prepHint}）</span>
                        ) : null}
                        {typeof s.timerMin === "number" ? (
                          <span className="ml-2 text-xs text-neutral-500">~{s.timerMin}min</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
            <div className="text-sm text-neutral-600 space-y-4">
              <div className="p-4 rounded-2xl border border-neutral-200 bg-neutral-50">
                <p>
                  提示：加入计划后可在“Plan”页生成倒计时提醒（解冻/泡发/淘米），并逐步勾选；同时可导出
                  ICS 添加到日历。
                </p>
              </div>
              {selected.lastCookedAt && (
                <div className="p-4 rounded-2xl border border-green-200 bg-green-50">
                  <div className="font-medium text-green-700">复刻模式</div>
                  <div className="text-xs mt-1">
                    上次：{fmtDateTime(selected.lastCookedAt)} · {selected.lastServings}
                    份 {selected.lastNotes ? `· 备注：${selected.lastNotes}` : ""}
                  </div>
                </div>
              )}
            </div>
          </div>
        </GlassPanel>
      )}
    </main>
  );
}

function scaleIngredients(
  ings: Ingredient[],
  baseServings: number,
  targetServings: number
): Ingredient[] {
  const ratio = (targetServings || 1) / (baseServings || 1);
  return ings.map((i) => ({
    ...i,
    qty: typeof i.qty === "number" ? i.qty * ratio : undefined,
  }));
}

function guessUnitPrice(inv: InventoryItem[], name: string) {
  const found = inv.find(
    (i) => i.ingredient.toLowerCase() === name.toLowerCase() && typeof i.unitPrice === "number"
  );
  return found?.unitPrice;
}

function Tag({ children, color }: { children: React.ReactNode; color: "orange" | "blue" | "green" | "red" | "gray" }) {
  const map: Record<string, string> = {
    orange: "bg-orange-100 text-orange-800",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-neutral-200 text-neutral-700",
  };
  return <span className={classNames("px-2 py-0.5 rounded-full text-[11px]", map[color])}>{children}</span>;
}

function defaultLocationFor(name: string): Location {
  const fresh = ["西兰花", "生菜", "鸡腿肉", "鸡胸肉", "牛肉", "猪肉"];
  if (fresh.some((x) => name.includes(x))) return "冷藏";
  const frozen = ["冻", "饺子", "鱼柳"];
  if (frozen.some((x) => name.includes(x))) return "冷冻";
  return "干货";
}

function RecipeEditor({ onSave }: { onSave: (r: Recipe) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [servings, setServings] = useState(2);
  const [pack, setPack] = useState(true);
  const [cuisine, setCuisine] = useState<CuisineTag>("Other");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [cookTimeMin, setCookTimeMin] = useState(30);
  const [imageUrl, setImageUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [steps, setSteps] = useState<{ text: string; prepHint?: string; timerMin?: number }[]>([]);
  const [stepText, setStepText] = useState("");
  const [stepHint, setStepHint] = useState("");
  const [stepTimer, setStepTimer] = useState<string>("");

  function addIng() {
    setIngredients([...ingredients, { name: "", qty: 0, unit: "g" }]);
  }
  function updateIng(idx: number, patch: Partial<Ingredient>) {
    setIngredients((ings) => ings.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeIng(idx: number) {
    setIngredients((ings) => ings.filter((_, i) => i !== idx));
  }

  function addStep() {
    if (!stepText.trim()) return;
    setSteps([
      ...steps,
      { text: stepText.trim(), prepHint: stepHint.trim() || undefined, timerMin: stepTimer ? parseInt(stepTimer) : undefined },
    ]);
    setStepText("");
    setStepHint("");
    setStepTimer("");
  }
  function removeStep(i: number) {
    setSteps((ss) => ss.filter((_, idx) => idx !== i));
  }

  function save() {
    if (!title.trim()) return;
    const r: Recipe = {
      id: sid(),
      title: title.trim(),
      packable: pack,
      servings,
      cuisine,
      difficulty,
      cookTimeMin,
      imageUrl: imageUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      ingredients,
      steps,
    };
    onSave(r);
    setOpen(false);
    setTitle("");
    setIngredients([]);
    setSteps([]);
    setNotes("");
    setImageUrl("");
  }

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-xl border border-neutral-200 text-sm"
      >
        新增菜谱
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/30 grid place-items-center p-4 z-20">
          <div className="bg-white w-full max-w-4xl rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">新增菜谱</h4>
              <button onClick={() => setOpen(false)} className="text-sm text-neutral-500">
                关闭
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm">菜名</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200"
                />
                <label className="block text-sm">基础份量</label>
                <input
                  type="number"
                  value={servings}
                  min={1}
                  onChange={(e) => setServings(parseInt(e.target.value || "1"))}
                  className="w-32 px-3 py-2 rounded-xl border border-neutral-200"
                />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="block text-sm">菜系</label>
                    <select
                      value={cuisine}
                      onChange={(e) => setCuisine(e.target.value as CuisineTag)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-200"
                    >
                      {(["CN", "JP", "IT", "TH", "Other"] as CuisineTag[]).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm">难度</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-200"
                    >
                      {(["easy", "normal", "hard"] as Difficulty[]).map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div>
                    <label className="block text-sm">烹饪时长（分）</label>
                    <input
                      type="number"
                      value={cookTimeMin}
                      onChange={(e) => setCookTimeMin(parseInt(e.target.value || "30"))}
                      className="w-full px-3 py-2 rounded-xl border border-neutral-200"
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-6">
                    <label className="text-sm">
                      <input type="checkbox" checked={pack} onChange={() => setPack(!pack)} /> 适合带饭
                    </label>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm">配图 URL</label>
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-200"
                />
                <label className="block text-sm">备注 / 准备提示</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-24 px-3 py-2 rounded-xl border border-neutral-200"
                />
                <div className="grid md:grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">食材</span>
                      <button onClick={addIng} className="text-sm px-2 py-1 border rounded-lg">
                        + 添加
                      </button>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-auto pr-1">
                      {ingredients.map((ig, i) => (
                        <div key={i} className="grid grid-cols-7 gap-1 items-center">
                          <input
                            placeholder="名称"
                            value={ig.name}
                            onChange={(e) => updateIng(i, { name: e.target.value })}
                            className="col-span-2 px-2 py-1 rounded-lg border border-neutral-200 text-sm"
                          />
                          <input
                            type="number"
                            placeholder="数量"
                            value={ig.qty || 0}
                            onChange={(e) => updateIng(i, { qty: parseFloat(e.target.value || "0") })}
                            className="px-2 py-1 rounded-lg border border-neutral-200 text-sm"
                          />
                          <select
                            value={ig.unit || "g"}
                            onChange={(e) => updateIng(i, { unit: e.target.value as Unit })}
                            className="px-2 py-1 rounded-lg border border-neutral-200 text-sm"
                          >
                            {["g","kg","ml","L","个","颗","包","罐","片","瓣","份","袋","盒","条","其他"].map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                          <label className="text-xs">
                            <input
                              type="checkbox"
                              checked={!!ig.requiresDefrost}
                              onChange={(e) => updateIng(i, { requiresDefrost: e.target.checked })}
                            />
                            冻
                          </label>
                          <input
                            type="number"
                            placeholder="泡(分)"
                            value={ig.requiresSoakMin || ""}
                            onChange={(e) =>
                              updateIng(i, {
                                requiresSoakMin: e.target.value ? parseInt(e.target.value) : undefined,
                              })
                            }
                            className="px-2 py-1 rounded-lg border border-neutral-200 text-sm"
                          />
                          <label className="text-xs">
                            <input
                              type="checkbox"
                              checked={!!ig.isRice}
                              onChange={(e) => updateIng(i, { isRice: e.target.checked })}
                            />
                            米
                          </label>
                          <button onClick={() => removeIng(i)} className="text-xs text-red-600">
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">步骤</span>
                    </div>
                    <div className="flex gap-1">
                      <input
                        placeholder="步骤描述"
                        value={stepText}
                        onChange={(e) => setStepText(e.target.value)}
                        className="flex-1 px-2 py-1 rounded-lg border border-neutral-200 text-sm"
                      />
                      <input
                        placeholder="提示"
                        value={stepHint}
                        onChange={(e) => setStepHint(e.target.value)}
                        className="w-32 px-2 py-1 rounded-lg border border-neutral-200 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="分钟"
                        value={stepTimer}
                        onChange={(e) => setStepTimer(e.target.value)}
                        className="w-24 px-2 py-1 rounded-lg border border-neutral-200 text-sm"
                      />
                      <button onClick={addStep} className="px-2 py-1 border rounded-lg text-sm">
                        + 添加
                      </button>
                    </div>
                    <ol className="list-decimal list-inside text-sm space-y-1 max-h-40 overflow-auto pr-1">
                      {steps.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span>
                            {s.text}
                            {s.prepHint ? <span className="text-neutral-500">（{s.prepHint}）</span> : null}
                            {typeof s.timerMin === "number" ? <span className="text-neutral-500"> ~{s.timerMin}min</span> : null}
                          </span>
                          <button onClick={() => removeStep(i)} className="text-xs text-red-600">
                            移除
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-3 py-2 rounded-xl border border-neutral-200">
                取消
              </button>
              <button onClick={save} className="px-3 py-2 rounded-xl bg-neutral-900 text-white">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------- Inventory 页面 -----------------------------

function InventoryView({
  inventory,
  setInventory,
  pushToast,
}: {
  inventory: InventoryItem[];
  setInventory: (xs: InventoryItem[]) => void;
  pushToast: (s: string) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("0");
  const [unit, setUnit] = useState<Unit>("g");
  const [location, setLocation] = useState<Location>("干货");
  const [expires, setExpires] = useState<string>("");

  const buckets = useMemo(() => groupInventory(inventory), [inventory]);
  const expiringSoon = useMemo(() => getExpiringItems(inventory).slice(0, 6), [inventory]);

  function add() {
    if (!name.trim()) return;
    const it: InventoryItem = {
      id: sid(),
      ingredient: name.trim(),
      qty: parseFloat(qty || "0"),
      unit,
      location,
      purchasedAt: Date.now(),
      expiresAt: expires ? new Date(expires + "T12:00:00").getTime() : undefined,
    };
    setInventory([it, ...inventory]);
    setName("");
    setQty("0");
    setExpires("");
    pushToast("已入库");
  }

  function toggleRemove(id: string) {
    setInventory(inventory.filter((x) => x.id !== id));
  }

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <GlassPanel>
        <SectionTitle
          title="库存一览"
          subtitle="快速入库、三栏视图与临期提醒，保持冰箱整洁"
        />
        <div className="grid lg:grid-cols-3 gap-4 mt-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <div className="grid md:grid-cols-5 gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="品名"
                  className="px-3 py-2 rounded-xl border border-neutral-200"
                />
                <input
                  value={qty}
                  type="number"
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="数量"
                  className="px-3 py-2 rounded-xl border border-neutral-200"
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as Unit)}
                  className="px-3 py-2 rounded-xl border border-neutral-200"
                >
                  {["g","kg","ml","L","个","颗","包","罐","片","瓣","份","袋","盒","条","其他"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value as Location)}
                  className="px-3 py-2 rounded-xl border border-neutral-200"
                >
                  {["冷藏","冷冻","干货"].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  type="date"
                  className="px-3 py-2 rounded-xl border border-neutral-200"
                />
              </div>
              <div className="mt-2 text-right">
                <button onClick={add} className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm">
                  添加
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {(Object.keys(buckets) as Location[]).map((loc) => (
                <div key={loc} className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{loc}</h4>
                    <span className="text-xs text-neutral-500">{buckets[loc].length} 项</span>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {buckets[loc].map((it) => (
                      <li
                        key={it.id}
                        className="p-3 rounded-2xl border border-neutral-200 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">{it.ingredient} · {it.qty}{it.unit}</div>
                          <div className="text-xs text-neutral-500">
                            {it.expiresAt ? `到期 ${fmtDate(it.expiresAt)}` : "无保质期"}
                          </div>
                        </div>
                        <button onClick={() => toggleRemove(it.id)} className="text-xs text-red-600">
                          移除
                        </button>
                      </li>
                    ))}
                    {buckets[loc].length === 0 && (
                      <li className="p-3 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 text-xs text-center">
                        暂无记录
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4">
              <h4 className="font-semibold">临期提醒</h4>
              <ul className="mt-2 space-y-2 text-sm">
                {expiringSoon.map((it) => (
                  <li key={it.id} className="p-3 rounded-2xl border border-orange-200 bg-orange-50">
                    <div className="font-medium text-orange-700">{it.ingredient}</div>
                    <div className="text-xs text-orange-600">剩余 {fmtDate(it.expiresAt)}</div>
                  </li>
                ))}
                {expiringSoon.length === 0 && (
                  <li className="p-3 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 text-xs text-center">
                    暂无临期食材
                  </li>
                )}
              </ul>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
              <p className="font-medium text-neutral-800">小贴士</p>
              <p className="mt-2 leading-relaxed">
                鼓励按照存放位置分区摆放，入库时补充单价信息，可用于预算估算。临期清单会优先推荐到首页“快用掉”列表。
              </p>
            </div>
          </div>
        </div>
      </GlassPanel>
    </main>
  );
}

function groupInventory(inv: InventoryItem[]) {
  const buckets: Record<Location, InventoryItem[]> = { 冷藏: [], 冷冻: [], 干货: [] };
  inv.forEach((i) => buckets[i.location].push(i));
  (Object.keys(buckets) as Location[]).forEach((k) =>
    buckets[k].sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity))
  );
  return buckets;
}

// ----------------------------- Plan 页面 -----------------------------

function PlanView({
  recipes,
  plans,
  setPlans,
}: {
  recipes: Recipe[];
  plans: MealPlan[];
  setPlans: (ps: MealPlan[]) => void;
}) {
  function ensureReminders(p: MealPlan): MealPlan {
    if (p.reminders && p.reminders.length) return p;
    const recipe = recipes.find((r) => r.id === p.recipeId);
    if (!recipe) return p;
    const cookAt = parseLocalDateTime(p.date, p.time);
    return { ...p, reminders: generateReminders(recipe, cookAt) };
  }

  function toggleDone(planId: string, rid: string) {
    setPlans(
      plans.map((p) => {
        if (p.id !== planId) return p;
        const rms = (p.reminders || []).map((r, i, arr) => {
          if (r.id !== rid) return r;
          const newR = { ...r, done: !r.done };
          if (!r.done) {
            const idx = arr.findIndex((x) => x.id === rid);
            if (idx >= 0 && idx + 1 < arr.length) arr[idx + 1].locked = false;
          }
          return newR;
        });
        return { ...p, reminders: rms };
      })
    );
  }

  function exportICS(p: MealPlan) {
    const r = recipes.find((x) => x.id === p.recipeId);
    if (!r) return;
    const enriched = ensureReminders(p);
    const ics = buildICS(enriched.reminders || [], r.title);
    downloadText(`${r.title}.ics`, ics);
  }

  const sortedPlans = useMemo(
    () =>
      [...plans]
        .map(ensureReminders)
        .sort((a, b) => parseLocalDateTime(a.date, a.time) - parseLocalDateTime(b.date, b.time)),
    [plans, recipes]
  );

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <GlassPanel>
        <SectionTitle title="烹饪计划" subtitle="生成倒计时提醒、导出日历，逐项打卡不遗漏" />
        {sortedPlans.length === 0 ? (
          <p className="text-sm text-neutral-600 mt-3">
            暂无计划，请在“Recipes”中加入计划。
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {sortedPlans.map((p) => {
              const r = recipes.find((x) => x.id === p.recipeId);
              const cookTs = parseLocalDateTime(p.date, p.time);
              return (
                <li key={p.id} className="p-4 rounded-3xl border border-neutral-200 bg-white shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-sm uppercase text-neutral-500">{p.date}</div>
                      <div className="text-xl font-semibold">{r?.title || "[已删除菜谱]"}</div>
                      <div className="text-sm text-neutral-500">
                        {p.time} · {p.servings} 份 {p.includeLunchNextDay ? "· 含明日午餐" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => exportICS(p)}
                        className="text-sm px-3 py-1.5 rounded-xl border border-neutral-200"
                      >
                        导出 ICS
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid md:grid-cols-2 gap-3">
                    {(p.reminders || []).map((rm) => (
                      <div
                        key={rm.id}
                        className={classNames(
                          "p-3 rounded-2xl border",
                          rm.done ? "bg-green-50 border-green-200" : "bg-neutral-50 border-neutral-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{rm.label}</div>
                            <div className="text-xs text-neutral-600">{fmtDateTime(rm.dueAt)}</div>
                          </div>
                          <label className="text-sm flex items-center gap-2">
                            <input
                              type="checkbox"
                              disabled={rm.locked}
                              checked={rm.done}
                              onChange={() => toggleDone(p.id, rm.id)}
                            />
                            {rm.locked ? (
                              <span className="text-xs text-neutral-400">未解锁</span>
                            ) : (
                              <span className="text-xs">完成</span>
                            )}
                          </label>
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          倒计时：{formatRemaining(rm.dueAt - Date.now())}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-neutral-500">
                    开煮时间：{fmtDateTime(cookTs)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassPanel>
    </main>
  );
}

// ----------------------------- List 页面 -----------------------------

function ListView({
  list,
  setList,
  inventory,
  setInventory,
  budgetPerWeek,
  setBudgetPerWeek,
  pushToast,
}: {
  list: ShoppingListItem[];
  setList: (xs: ShoppingListItem[]) => void;
  inventory: InventoryItem[];
  setInventory: (xs: InventoryItem[]) => void;
  budgetPerWeek: number;
  setBudgetPerWeek: (n: number) => void;
  pushToast: (s: string) => void;
}) {
  const total = useMemo(() => list.reduce((s, i) => s + (i.estPrice || 0), 0), [list]);
  const purchased = useMemo(() => list.filter((x) => x.checked).reduce((s, i) => s + (i.estPrice || 0), 0), [list]);
  const progress = budgetPerWeek > 0 ? clamp(purchased / budgetPerWeek, 0, 1) : 0;

  function toggleCheck(id: string) {
    setList(list.map((x) => (x.id === id ? { ...x, checked: !x.checked } : x)));
  }

  function writeBackToInventory() {
    const toAdd = list.filter((x) => x.checked);
    if (toAdd.length === 0) return;
    const newInv: InventoryItem[] = [
      ...inventory,
      ...toAdd.map((x) => ({
        id: sid(),
        ingredient: x.ingredient,
        qty: x.qty,
        unit: x.unit,
        location: x.location || defaultLocationFor(x.ingredient),
        purchasedAt: Date.now(),
        expiresAt: (x.location || defaultLocationFor(x.ingredient)) === "干货" ? daysFromNow(180) : daysFromNow(14),
        unitPrice: x.estPrice && x.qty > 0 ? x.estPrice / x.qty : undefined,
      })),
    ];
    setInventory(newInv);
    setList(list.filter((x) => !x.checked));
    pushToast("已写回库存并清除已购项");
  }

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      <GlassPanel>
        <SectionTitle title="购物清单" subtitle="自动合并同名食材，勾选后可写回库存" />
        <div className="mt-3 grid md:grid-cols-[2fr,1fr] gap-4">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-neutral-700">
                预计总价：<span className="font-semibold">${round2(total)}</span>
              </div>
              <label className="text-sm text-neutral-700">
                预算（周）：
                <input
                  type="number"
                  value={budgetPerWeek}
                  onChange={(e) => setBudgetPerWeek(parseFloat(e.target.value || "0"))}
                  className="ml-2 w-24 px-2 py-1 rounded-lg border border-neutral-200"
                />
              </label>
            </div>
            <BudgetProgress value={progress} label={`已购 ${round2(purchased)} / ${budgetPerWeek || 0}`} />
            <ul className="mt-4 space-y-2">
              {list.map((it) => (
                <li key={it.id} className="p-3 rounded-2xl border border-neutral-200 bg-white flex items-center justify-between">
                  <div>
                    <div className="font-medium">{it.ingredient} · {it.qty}{it.unit}</div>
                    <div className="text-xs text-neutral-500">
                      预计 ${it.estPrice ? round2(it.estPrice) : "-"} · {it.location || defaultLocationFor(it.ingredient)}
                    </div>
                  </div>
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={!!it.checked} onChange={() => toggleCheck(it.id)} /> 已购
                  </label>
                </li>
              ))}
              {list.length === 0 && (
                <li className="p-3 rounded-2xl border border-dashed border-neutral-300 text-neutral-500 text-sm text-center">
                  清单为空，可在菜谱页快速生成。
                </li>
              )}
            </ul>
            <div className="mt-4 text-right">
              <button onClick={writeBackToInventory} className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-sm">
                写回库存
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600 space-y-3">
            <div>
              <p className="font-medium text-neutral-800">小技巧</p>
              <p className="mt-2">
                勾选“已购”后点击“写回库存”，系统会自动推算单价并更新库存，方便后续预算。
              </p>
            </div>
            <div>
              <p className="font-medium text-neutral-800">预算提醒</p>
              <p className="mt-2">
                进度条超过 80% 时会高亮提示，帮助在学生预算中保持克制。
              </p>
            </div>
          </div>
        </div>
      </GlassPanel>
    </main>
  );
}

function BudgetProgress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.9 ? "bg-red-500" : value >= 0.6 ? "bg-orange-500" : "bg-green-500";
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>预算进度</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-neutral-200 overflow-hidden">
        <div className={classNames("h-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ----------------------------- 自测（不会阻塞 UI） -----------------------------

function softAssert(cond: boolean, msg: string) {
  if (!cond) console.warn("[TEST] ", msg);
}

function runSelfTests() {
  const ing: Ingredient[] = [{ name: "米", qty: 100, unit: "g" }];
  const s2 = scaleIngredients(ing, 2, 3);
  softAssert(Math.abs((s2[0].qty || 0) - 150) < 1e-6, "份量缩放应正确 (100g@2份 -> 150g@3份)");

  const recip: Recipe = {
    id: "t",
    title: "T",
    ingredients: [
      { name: "肉", requiresDefrost: true },
      { name: "干香菇", requiresSoakMin: 90 },
      { name: "大米", isRice: true },
    ],
  } as any;
  const t0 = Date.now() + 4 * 60 * 60 * 1000;
  const rems = generateReminders(recip, t0);
  softAssert(rems.length === 4, "应生成 4 条提醒");
  softAssert(
    rems[0].locked === false && rems.slice(1).every((r) => r.locked === true),
    "仅第一条解锁，其余锁定"
  );

  const ics = buildICS(rems, "测试菜谱");
  softAssert(ics.includes("BEGIN:VCALENDAR"), "ICS 应包含 BEGIN:VCALENDAR");
  softAssert(ics.includes("END:VCALENDAR"), "ICS 应包含 END:VCALENDAR");

  const sugg = suggestRecipes(DEMO_RECIPES, DEMO_INVENTORY, 60);
  softAssert(sugg.length <= 3, "推荐最多返回 3 道菜");
}
