import { localeToSpeechLanguage, type Locale } from "./i18n";

export type SpeechPriority = "normal" | "drift" | "reroute" | "deviation" | "arrival";

export interface SpeechUtteranceLike {
  lang: string;
  volume?: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechUtteranceLike): void;
  resume?: () => void;
  cancel?: () => void;
}

export interface SpeechRequest {
  readonly eventId: string;
  readonly phrase: string;
  readonly locale: Locale;
  readonly priority?: SpeechPriority;
}

interface QueuedSpeech extends SpeechRequest {
  readonly resolve: (played: boolean) => void;
}

// Arrival > deviation > reroute > drift > ordinary turn/start instructions.
const PRIORITY: Record<SpeechPriority, number> = {
  normal: 0,
  drift: 1,
  reroute: 2,
  deviation: 3,
  arrival: 4,
};

function browserSpeech(): { synthesis: SpeechSynthesisLike; createUtterance: (text: string) => SpeechUtteranceLike } | null {
  if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    return null;
  }
  return {
    synthesis: window.speechSynthesis as unknown as SpeechSynthesisLike,
    createUtterance: (text) => new SpeechSynthesisUtterance(text) as unknown as SpeechUtteranceLike,
  };
}

/** Warm up the browser speech engine from the user's Start button gesture. */
export function primeSpeech(locale: Locale): boolean {
  const browser = browserSpeech();
  if (!browser) return false;
  try {
    const utterance = browser.createUtterance(" ");
    utterance.lang = localeToSpeechLanguage(locale);
    utterance.volume = 0;
    browser.synthesis.resume?.();
    browser.synthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

/**
 * A small serialized speech queue. The old implementation cancelled every
 * utterance before speaking, so a reroute/warning could silently discard a
 * turn instruction. Completion is reported only after SpeechSynthesis emits
 * end; an error leaves the caller free to retry the event. The browser can
 * emit start before audio output is actually stable, so start is not success.
 */
export class SpeechQueue {
  private readonly synthesis: SpeechSynthesisLike | null;
  private readonly createUtterance: ((text: string) => SpeechUtteranceLike) | null;
  private readonly queue: QueuedSpeech[] = [];
  private active = false;
  private activeResolve: ((played: boolean) => void) | null = null;

  constructor(
    synthesis?: SpeechSynthesisLike | null,
    createUtterance?: ((text: string) => SpeechUtteranceLike) | null,
  ) {
    const browser = synthesis === undefined && createUtterance === undefined ? browserSpeech() : null;
    this.synthesis = synthesis === undefined ? browser?.synthesis ?? null : synthesis;
    this.createUtterance = createUtterance === undefined ? browser?.createUtterance ?? null : createUtterance;
  }

  enqueue(request: SpeechRequest): Promise<boolean> {
    if (!this.synthesis || !this.createUtterance || !request.phrase.trim()) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      this.queue.push({ ...request, resolve });
      this.queue.sort((a, b) => PRIORITY[b.priority ?? "normal"] - PRIORITY[a.priority ?? "normal"]);
      this.pump();
    });
  }

  clear(): void {
    while (this.queue.length) this.queue.shift()?.resolve(false);
    this.activeResolve?.(false);
    this.activeResolve = null;
    this.active = false;
    // Clearing is used only when a navigation session ends or a route changes.
    // It intentionally does not cancel normal inter-event playback.
    this.synthesis?.cancel?.();
  }

  private pump(): void {
    if (this.active || this.queue.length === 0 || !this.synthesis || !this.createUtterance) return;
    const item = this.queue.shift();
    if (!item) return;
    this.active = true;
    let settled = false;
    const settle = (played: boolean) => {
      if (settled) return;
      settled = true;
      item.resolve(played);
    };
    const finish = (played: boolean) => {
      settle(played);
      this.activeResolve = null;
      this.active = false;
      this.pump();
    };
    this.activeResolve = settle;
    try {
      const utterance = this.createUtterance(item.phrase);
      utterance.lang = localeToSpeechLanguage(item.locale);
      // onstart only means the browser accepted the utterance. Audio focus or
      // output can still fail afterwards, so resolve success on onend only.
      utterance.onstart = () => undefined;
      utterance.onend = () => finish(true);
      utterance.onerror = () => finish(false);
      this.synthesis.resume?.();
      this.synthesis.speak(utterance);
    } catch {
      finish(false);
    }
  }
}
