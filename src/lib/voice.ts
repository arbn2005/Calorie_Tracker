import type { FoodCategory, MealType } from "../types";

/* ------------------------------------------------------------------ */
/*  Assistant command layer — plain English in, actions out.           */
/*                                                                     */
/*  Google Gemini (generativelanguage.googleapis).  Config in          */
/*  .env.local (gitignored, never committed):                          */
/*    VITE_VOICE_API_KEY  Google AI Studio key (required)              */
/*    VITE_AI_MODEL       optional model override                      */
/*                                                                     */
/*  Requests carry the google_search tool, so the model can look       */
/*  foods up on the internet when its own knowledge is thin            */
/*  (regional dishes, branded products, etc.).                         */
/* ------------------------------------------------------------------ */

const API_KEY = (import.meta.env.VITE_VOICE_API_KEY as string | undefined) ?? "";
const CONFIGURED_MODEL =
  (import.meta.env.VITE_AI_MODEL as string | undefined) ?? "";

/* gemini-3.8-flash: current flagship flash with google_search grounding.
   gemma-4-31b-it: free-tier-friendly fallback (no grounding; estimates
   come from the model's nutrition knowledge instead of the internet).
   Retry budget per model is tuned to free-tier behaviour: little sense
   hammering a quota-dead primary — hand over to the fallback quickly. */
const DEFAULT_MODEL_CHAIN: Array<{ model: string; attempts: number; backoff429: number }> = [
  { model: "gemini-3.8-flash", attempts: 2, backoff429: 8000 },
  { model: "gemma-4-31b-it", attempts: 5, backoff429: 18000 },
];

function modelChain(): Array<{ model: string; attempts: number; backoff429: number }> {
  const configured = CONFIGURED_MODEL.trim();
  if (configured && configured !== "gemma-4-31b-it") {
    return [{ model: configured, attempts: 3, backoff429: 10000 }];
  }
  return DEFAULT_MODEL_CHAIN;
}

const REQUEST_TIMEOUT_MS = 45000;
const CHAIN_DEADLINE_MS = 120000;

const MEAL_KEYS: MealType[] = ["breakfast", "lunch", "dinner", "snacks"];

export interface ParsedFood {
  name: string;
  kcalPer100g: number;
  grams: number;
}

export interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

const CMD_SYSTEM = [
  "You are the command layer of a calorie tracker assistant. The user speaks or types commands; classify each user message into exactly one action.",
  'ACTION "add": the user described food(s) to log into a meal. Extract every food with: name; kcalPer100g (search the web when unsure, especially regional / Indian dishes and branded foods); grams (best estimate of what was eaten); portionName and portionGrams when the food is countable or standardised (e.g. "1 chapati" about 40 g, "1 idli" about 40 g, "1 cup milk" 240 g); needsQuantity true when the user did not clearly state how much (then still fill grams with your best guess so it can be confirmed); assumption text for every default you adopted (e.g. "assumed plain atta chapati with a little ghee", "assumed tea with whole milk and sugar"). If the quantity is missing, the app will ask the user — mention it briefly in reply.',
  'ACTION "query": the user asks about tracked data, history, trends or totals. Set period.days (7 for a week, 30 for a month, 1 for today, 2 for "yesterday and today" ...) and period.startOffset (how many days before today the period begins; 0 when the period includes today, 1 for "yesterday", 7 for "last week"). reply is one short line describing what you will show.',
  'ACTION "chat": anything else; reply briefly and helpfully, no foods.',
  'For "add", set meal to breakfast|lunch|dinner|snacks when the user mentions one; omit meal when they do not (the app will ask).',
  "Respond with ONLY a JSON object, no prose, no markdown fences:",
  '{"action":"add","reply":"Adding 2 chapatis — need the rice amount.","meal":"lunch","foods":[{"name":"Chapati","kcalPer100g":300,"grams":80,"portionName":"1 chapati","portionGrams":40,"needsQuantity":false,"assumption":"assumed plain atta chapati with a little ghee"}],"period":{"days":30,"startOffset":0}}',
].join("\n");

/* ------------------------------------------------------------------ */
/*  Command layer                                                      */
/* ------------------------------------------------------------------ */

export interface AssistantFood {
  name: string;
  kcalPer100g: number;
  grams: number;
  portionName?: string;
  portionGrams?: number;
  needsQuantity?: boolean;
  assumption?: string;
}

export interface AssistantPeriod {
  days: number;
  startOffset: number;
}

export interface AssistantResult {
  action: "add" | "query" | "chat";
  reply: string;
  meal?: MealType;
  foods: AssistantFood[];
  period?: AssistantPeriod;
}

function normalizeAssistantFood(raw: unknown): AssistantFood | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  /* unlike normalizeFood, zero grams is tolerated: those rows are the
     ones the UI prompts the user for an amount */
  const name =
    typeof entry.name === "string"
      ? entry.name.trim()
      : typeof entry.food === "string"
        ? (entry.food as string).trim()
        : "";
  const kcal = asNumber(entry.kcalPer100g) || asNumber(entry.kcal_per_100g) || asNumber(entry.kcal100);
  if (!name || !(kcal > 0)) return null;
  const gramsRaw = asNumber(entry.grams) || asNumber(entry.amount_g) || asNumber(entry.quantity_g);
  const food: AssistantFood = {
    name,
    kcalPer100g: kcal,
    grams: Math.max(0, gramsRaw || 0),
  };
  if (typeof entry.portionName === "string" && entry.portionName.trim()) {
    food.portionName = entry.portionName.trim();
  }
  const portionGrams = asNumber(entry.portionGrams);
  if (portionGrams > 0) food.portionGrams = portionGrams;
  if (food.grams <= 0 || entry.needsQuantity === true) {
    food.needsQuantity = true;
  }
  if (typeof entry.assumption === "string" && entry.assumption.trim()) {
    food.assumption = entry.assumption.trim();
  }
  return food;
}

function normalizePeriod(data: Record<string, unknown>): AssistantPeriod | undefined {
  const raw = data.period;
  if (typeof raw !== "object" || raw === null) return undefined;
  const entry = raw as Record<string, unknown>;
  const days = asNumber(entry.days);
  if (!(days > 0)) return undefined;
  const startOffset = Math.max(0, asNumber(entry.startOffset) || 0);
  return { days: Math.min(365, Math.round(days)), startOffset };
}

/** Conversational command turn → classified action for the UI to run. */
export async function assistantTurn(
  history: ChatMessage[],
  options: { mealType?: MealType; language?: string; signal?: AbortSignal } = {},
): Promise<AssistantResult> {
  if (!history.length) throw new Error("no messages");
  const seeded: ChatMessage[] = [
    {
      role: "ai",
      text: `Context: current meal slot ${options.mealType ?? "unknown"}, user language ${options.language ?? "en"}.`,
    },
    ...history,
  ];
  const data = await geminiJson(CMD_SYSTEM, seeded, options.signal);
  const action =
    data.action === "add" || data.action === "query"
      ? data.action
      : "chat";
  const foods =
    action === "add"
      ? (Array.isArray((data as Record<string, unknown>).foods)
          ? ((data as Record<string, unknown>).foods as unknown[])
          : []
        )
          .map(normalizeAssistantFood)
          .filter((food): food is AssistantFood => food !== null)
      : [];
  const result: AssistantResult = {
    action,
    reply:
      typeof data.reply === "string" && data.reply.trim()
        ? data.reply.trim()
        : action === "add"
          ? `Parsed ${foods.length} food${foods.length === 1 ? "" : "s"}.`
          : "",
    foods,
  };
  const meal = parseMeals(data);
  if (meal) result.meal = meal;
  const period = normalizePeriod(data);
  if (period) result.period = period;
  return result;
}

/* --- generic JSON extraction: models may chatter before the answer ---
   Scan for balanced top-level {...} objects (string-aware), then parse
   candidates last-first and prefer one shaped like our reply. */

function balancedObjects(text: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        found.push(text.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return found;
}

function looksLikeOurReply(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    Array.isArray(entry.foods) ||
    typeof entry.reply === "string" ||
    typeof entry.meal === "string"
  );
}

function extractJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```json|```/g, "");
  const candidates = balancedObjects(cleaned);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(candidates[i]) as Record<string, unknown>;
      if (looksLikeOurReply(parsed)) return parsed;
    } catch {
      // keep looking
    }
  }
  throw new Error("AI reply was not JSON");
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : NaN;
}

function parseMeals(data: Record<string, unknown>): MealType | undefined {
  return typeof data.meal === "string" &&
    MEAL_KEYS.includes(data.meal as MealType)
    ? (data.meal as MealType)
    : undefined;
}

/* --- Gemini --- */

interface GeminiPart {
  text?: string;
}

async function geminiJson(
  system: string,
  messages: ChatMessage[],
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!API_KEY) throw new Error("no AI key configured");
  const failures: string[] = [];
  const startedAt = Date.now();
  for (const plan of modelChain()) {
    for (let attempt = 0; attempt < plan.attempts; attempt += 1) {
      try {
        return await geminiCall(system, messages, plan.model, true, signal);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push(`${plan.model}: ${message}`);
        /* Free tier: models intermittently answer 5xx (overload) or
           429 (per-minute quota). Back off, retry, then fall through
           to the next model — but keep the experience bounded. */
        const retriable = /AI 5\d\d|AI 429/.test(message);
        if (!retriable) break;
        if (
          attempt === plan.attempts - 1 ||
          Date.now() - startedAt > CHAIN_DEADLINE_MS
        ) {
          break;
        }
        /* per-minute quota does not clear in a second; wait it out */
        const backoff = /AI 429/.test(message)
          ? plan.backoff429
          : 1500 * (attempt + 1);
        await new Promise((resolve) => window.setTimeout(resolve, backoff));
      }
    }
    if (Date.now() - startedAt > CHAIN_DEADLINE_MS) break;
  }
  throw new Error(`AI unavailable — ${failures.join(" | ")}`);
}

async function geminiCall(
  system: string,
  messages: ChatMessage[],
  model: string,
  useTools: boolean,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    /* Gemma ignores system-instruction roles on this API; merge the
       instruction into the user turn instead. */
    const isGemma = /^gemma/.test(model);
    const tools = isGemma || !useTools ? undefined : [{ google_search: {} }];
    const contents = isGemma
      ? [
          {
            role: "user",
            parts: [
              {
                text: [
                  system,
                  "---",
                  messages
                    .map((message) =>
                      message.role === "ai"
                        ? `Your previous reply: ${message.text}`
                        : message.text,
                    )
                    .join("\n\n"),
                ].join("\n\n"),
              },
            ],
          },
        ]
      : messages.map((message) => ({
          role: message.role === "ai" ? "model" : "user",
          parts: [{ text: message.text }],
        }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: isGemma ? undefined : { parts: [{ text: system }] },
          contents,
          tools,
          generationConfig: { temperature: 0.2 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const detail = await response
        .text()
        .then((text) => text.slice(0, 200))
        .catch(() => "");
      if (response.status === 400 && /tool/i.test(detail)) {
        return await geminiCall(system, messages, model, false, signal);
      }
      throw new Error(`AI ${response.status} ${detail}`);
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("");
    if (!text.trim()) throw new Error("AI returned an empty reply");
    return extractJson(text);
  } finally {
    window.clearTimeout(timer);
  }
}

/* --- custom endpoint (optional escape hatch) --- */

/* Cheap local heuristic so logged foods land with a sane category
   chip; the AI may later return its own category per food. */
export function guessCategory(name: string): FoodCategory {
  const lower = name.toLowerCase();
  const table: Array<[RegExp, FoodCategory]> = [
    [/milk|curd|yogurt|buttermilk|lassi|paneer|cheese/, "dairy"],
    [/ghee|butter|oil/, "oils"],
    [/dal|lentil|bean|chicken|egg|fish|meat|mutton|prawn|tofu|soy/, "protein"],
    [/tea|coffee|juice|soda|water|shake|smoothie/, "drinks"],
    [/sugar|sweet|jaggery|halwa|dessert|cake|gulab|jalebi/, "sweets"],
    [/rice|roti|bread|chapati|chappathi|wheat|oat|pasta|noodle|idli|dosa|poha|upma/, "grains"],
    [/veg|curry|sabzi|salad|pickle|sambar|rasam|soup/, "vegetables"],
  ];
  for (const [pattern, category] of table) {
    if (pattern.test(lower)) return category;
  }
  return "grains";
}

/* ------------------------------------------------------------------ */
/*  On-device speech capture (Web Speech API, Chrome / Android).       */
/* ------------------------------------------------------------------ */

interface SpeechResultAlternativeLike {
  transcript: string;
}

interface SpeechResultLike {
  isFinal: boolean;
  0: SpeechResultAlternativeLike;
  length: number;
}

interface SpeechEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResultLike };
}

interface RecognizerLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: SpeechEventLike) => void) | null;
}

type RecognizerCtor = new () => RecognizerLike;

export interface RecognizerHandle {
  stop(): void;
}

/** True when this browser supports on-device speech capture. */
export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Start listening. Returns a handle to stop. The transcript streams
 * through onText (final grows, interim is provisional); onDone fires
 * when the utterance ends so the caller can hand off to parseVoice.
 */
export function startListening(options: {
  language: string;
  onText: (final: string, interim: string) => void;
  onDone: (final: string) => void;
  onError: () => void;
}): RecognizerHandle | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognizerCtor;
    webkitSpeechRecognition?: RecognizerCtor;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognizer = new Ctor();
  recognizer.lang = options.language;
  recognizer.continuous = false;
  recognizer.interimResults = true;

  let finalText = "";
  recognizer.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    options.onText(finalText.trim(), interim.trim());
  };
  recognizer.onerror = options.onError;
  recognizer.onend = () => options.onDone(finalText.trim());

  try {
    recognizer.start();
  } catch {
    return null;
  }
  return { stop: () => recognizer.stop() };
}
