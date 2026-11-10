import type { MealType } from "../types";

/* ------------------------------------------------------------------ */
/*  AI food parser — plain English in, named + weighed foods out.      */
/*                                                                     */
/*  Primary provider: Google Gemini (generativelanguage.googleapis).   */
/*  Config, all in .env.local (gitignored, never committed):           */
/*    VITE_VOICE_API_KEY  Google AI Studio key (required)              */
/*    VITE_AI_MODEL       defaults to gemini-2.5-flash                 */
/*    VITE_VOICE_API_URL  optional custom endpoint implementing the    */
/*                        original contract (see customParse below)    */
/*                                                                     */
/*  The Gemini requests carry the google_search tool, so the model     */
/*  can look foods up on the internet when its own knowledge is        */
/*  thin (regional dishes, branded products, etc.).                    */
/* ------------------------------------------------------------------ */

const API_KEY = (import.meta.env.VITE_VOICE_API_KEY as string | undefined) ?? "";
const CONFIGURED_MODEL =
  (import.meta.env.VITE_AI_MODEL as string | undefined) ?? "";
const ENDPOINT = (import.meta.env.VITE_VOICE_API_URL as string | undefined) ?? "";

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

export interface VoiceParseResult {
  meal?: MealType;
  foods: ParsedFood[];
}

export interface ChatTurnResult {
  reply: string;
  meal?: MealType;
  foods: ParsedFood[];
}

export interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

const PARSE_SYSTEM = [
  "You convert plain-language meal descriptions into structured food entries for a calorie tracker.",
  "Identify every distinct food or drink the user ate, and estimate:",
  "- grams consumed (convert servings: 1 cup cooked rice ~158 g, 1 roti ~40 g, 1 cup milk ~240 ml, 1 bowl dal ~150-200 g, 1 idli ~40 g, 1 dosa ~120 g, 1 biscuit ~12 g; treat ml as grams for drinks)",
  "- kcal per 100 g of that food",
  "Use your nutrition knowledge, and search the internet when uncertain, especially for regional / Indian dishes and branded packaged foods.",
  "If the user mentions their meal (lunch etc.) and no meal is provided in the context, set meal to breakfast|lunch|dinner|snacks from what they say; otherwise omit it.",
  "Respond with ONLY a JSON object, no prose, no markdown fences:",
  '{"meal":"lunch","foods":[{"name":"Rice","kcalPer100g":130,"grams":300}]}',
].join("\n");

const CHAT_SYSTEM = [
  "You are the chat assistant inside a calorie tracker app. The user describes what they are eating, conversationally.",
  "For every user message: 1) extract newly added foods exactly like a nutrition parser (estimate grams and kcal per 100 g; search the internet when uncertain, especially for regional / Indian dishes and branded foods), 2) reply briefly and warmly (one or two sentences) confirming what you recorded with rough calories.",
  "foods must contain ONLY the items newly added in the user's latest message, not a running list. If the message adds no foods (small talk, questions), return an empty foods array.",
  "If the user mentions which meal it is, set meal to breakfast|lunch|dinner|snacks.",
  "Respond with ONLY a JSON object, no prose, no markdown fences:",
  '{"reply":"Got it — 2 rotis (~80 g, ~240 kcal) recorded.","meal":"dinner","foods":[{"name":"Roti","kcalPer100g":297,"grams":80}]}',
].join("\n");

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

function normalizeFood(raw: unknown): ParsedFood | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  const name =
    typeof entry.name === "string"
      ? entry.name.trim()
      : typeof entry.food === "string"
        ? (entry.food as string).trim()
        : "";
  if (!name) return null;
  const kcal =
    asNumber(entry.kcalPer100g) ||
    asNumber(entry.kcal_per_100g) ||
    asNumber(entry.kcal100);
  const grams =
    asNumber(entry.grams) ||
    asNumber(entry.amount_g) ||
    asNumber(entry.quantity_g);
  if (!(kcal > 0) || !(grams > 0)) return null;
  return { name, kcalPer100g: kcal, grams };
}

function parseMeals(data: Record<string, unknown>): MealType | undefined {
  return typeof data.meal === "string" &&
    MEAL_KEYS.includes(data.meal as MealType)
    ? (data.meal as MealType)
    : undefined;
}

function parseFoods(data: Record<string, unknown>): ParsedFood[] {
  const list = Array.isArray(data.foods)
    ? data.foods
    : Array.isArray((data as Record<string, unknown>).items)
      ? ((data as Record<string, unknown>).items as unknown[])
      : [];
  return list
    .map(normalizeFood)
    .filter((food): food is ParsedFood => food !== null);
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

async function customJson(
  body: unknown,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  } finally {
    window.clearTimeout(timer);
  }
}

function usingGemini(): boolean {
  return Boolean(API_KEY) && !ENDPOINT.trim();
}

/* --- public API --- */

/** One-shot: turn a description into foods (used by the voice panel). */
export async function parseVoice(
  text: string,
  options: { mealType?: MealType; language?: string; signal?: AbortSignal } = {},
): Promise<VoiceParseResult> {
  const input = [
    `Current meal slot if not stated: ${options.mealType ?? "unknown"}.`,
    `User language: ${options.language ?? "en"}.`,
    `Description: ${text}`,
  ].join("\n");
  const data = usingGemini()
    ? await geminiJson(PARSE_SYSTEM, [{ role: "user", text: input }], options.signal)
    : await customJson(
        { text, mealType: options.mealType, language: options.language },
        options.signal,
      );
  const result: VoiceParseResult = { foods: parseFoods(data) };
  const meal = parseMeals(data);
  if (meal) result.meal = meal;
  if (!result.foods.length) throw new Error("AI returned no usable foods");
  return result;
}

/** Conversational turn: reply text + any foods the user just added. */
export async function chatTurn(
  history: ChatMessage[],
  options: { mealType?: MealType; language?: string; signal?: AbortSignal } = {},
): Promise<ChatTurnResult> {
  if (!history.length) throw new Error("no messages");
  const last = history[history.length - 1];
  const seeded: ChatMessage[] = [
    {
      role: "ai",
      text: `Context: current meal slot is ${options.mealType ?? "unknown"}, user language ${options.language ?? "en"}.`,
    },
    ...history,
  ];
  const data: Record<string, unknown> = usingGemini()
    ? await geminiJson(CHAT_SYSTEM, seeded, options.signal)
    : // Custom endpoints speak the one-shot contract; build a synthetic turn.
      await customJson(
        { text: last.text, mealType: options.mealType, language: options.language },
        options.signal,
      );
  const foods = parseFoods(data);
  const reply =
    typeof data.reply === "string" && data.reply.trim()
      ? data.reply.trim()
      : foods.length
        ? `Recorded ${foods.length} food${foods.length === 1 ? "" : "s"}.`
        : "";
  const turn: ChatTurnResult = { reply, foods };
  const meal = parseMeals(data);
  if (meal) turn.meal = meal;
  return turn;
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
