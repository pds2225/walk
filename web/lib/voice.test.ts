import { describe, expect, it, vi } from "vitest";
import { SpeechQueue, type SpeechSynthesisLike, type SpeechUtteranceLike } from "./voice";

function fakeVoice() {
  const utterances: SpeechUtteranceLike[] = [];
  const synthesis: SpeechSynthesisLike = {
    resume: vi.fn(),
    speak: vi.fn((utterance) => utterances.push(utterance)),
    cancel: vi.fn(),
  };
  const createUtterance = vi.fn((): SpeechUtteranceLike => ({
    lang: "",
    onstart: null,
    onend: null,
    onerror: null,
  }));
  return { synthesis, utterances, createUtterance };
}

describe("SpeechQueue", () => {
  it("serializes announcements and reports success only after playback starts/ends", async () => {
    const fake = fakeVoice();
    const queue = new SpeechQueue(fake.synthesis, fake.createUtterance);
    const first = queue.enqueue({ eventId: "turn-1", phrase: "Turn left", locale: "en" });
    const second = queue.enqueue({ eventId: "turn-2", phrase: "Turn right", locale: "en" });

    expect(fake.utterances).toHaveLength(1);
    expect(fake.utterances[0].lang).toBe("en-US");
    fake.utterances[0].onstart?.();
    expect(await first).toBe(true);
    expect(fake.utterances).toHaveLength(1);

    fake.utterances[0].onend?.();
    expect(fake.utterances).toHaveLength(2);
    fake.utterances[1].onend?.();
    expect(await second).toBe(true);
  });

  it("reports a synthesis error as failure and allows the event to be retried", async () => {
    const fake = fakeVoice();
    const queue = new SpeechQueue(fake.synthesis, fake.createUtterance);
    const failed = queue.enqueue({ eventId: "deviation", phrase: "Check the route", locale: "en" });
    fake.utterances[0].onerror?.();
    expect(await failed).toBe(false);

    const retried = queue.enqueue({ eventId: "deviation", phrase: "Check the route", locale: "en" });
    expect(fake.utterances).toHaveLength(2);
    fake.utterances[1].onstart?.();
    fake.utterances[1].onend?.();
    expect(await retried).toBe(true);
    expect(fake.synthesis.cancel).not.toHaveBeenCalled();
  });

  it("does not leave a pending promise when a navigation session is cleared", async () => {
    const fake = fakeVoice();
    const queue = new SpeechQueue(fake.synthesis, fake.createUtterance);
    const pending = queue.enqueue({ eventId: "arrival", phrase: "Arrived", locale: "en" });
    queue.clear();

    expect(await pending).toBe(false);
    expect(fake.synthesis.cancel).toHaveBeenCalledTimes(1);
  });
});
