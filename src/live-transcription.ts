import type { AudioChunk } from "./audio";

export type TranscriptionTask = {
  chunk: AudioChunk;
  sessionId: string;
  final: boolean;
};
type Callbacks = {
  transcribe: (wav: ArrayBuffer) => Promise<string>;
  commit: (task: TranscriptionTask, text: string) => Promise<void>;
  partial: (task: TranscriptionTask, text: string) => void;
  settled: (task: TranscriptionTask) => void;
  failed: (task: TranscriptionTask, error: Error) => void;
  pending: (count: number) => void;
  deduplicated?: (
    task: TranscriptionTask,
    removedMs: number,
    empty: boolean,
  ) => void;
};
type AudioFilter = {
  accepted: (task: TranscriptionTask, text: string) => void;
  filter: (task: TranscriptionTask) => {
    wav: ArrayBuffer | null;
    removedMs: number;
  };
};

// One inference at a time. Superseded previews are replaced rather than queued;
// finalized speech takes priority so the two channels never accumulate old previews.
export class LiveTranscriptionQueue {
  private waiting = new Map<string, TranscriptionTask>();
  private finalizing = new Set<string>();
  private running = false;
  constructor(
    private callbacks: Callbacks,
    private audioFilter?: AudioFilter,
  ) {}
  submit(task: TranscriptionTask) {
    const key = task.sessionId + ":" + task.chunk.chunkId;
    if (!task.final && this.finalizing.has(key)) return;
    if (task.final) this.finalizing.add(key);
    this.waiting.set(key, task);
    this.callbacks.pending(this.waiting.size + Number(this.running));
    void this.drain();
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    while (this.waiting.size) {
      // Allow the other channel's final chunk to arrive before committing a
      // microphone echo. Prefer completed playback as its authoritative source.
      if (
        this.audioFilter &&
        [...this.waiting.values()].every((t) => t.chunk.source === "麦克风")
      )
        await new Promise((resolve) => setTimeout(resolve, 250));
      const entries = [...this.waiting];
      const entry =
        (this.audioFilter &&
          entries.find(([, t]) => t.final && t.chunk.source === "会议声音")) ||
        entries.find(([, task]) => task.final) ||
        (this.audioFilter &&
          entries.find(([, t]) => t.chunk.source === "会议声音")) ||
        entries[0];
      const [key, task] = entry;
      this.waiting.delete(key);
      try {
        const filtered = this.audioFilter?.filter(task) || {
          wav: task.chunk.wav,
          removedMs: 0,
        };
        const text = filtered.wav
          ? await this.callbacks.transcribe(filtered.wav)
          : "";
        if (task.final) {
          if (text.trim()) await this.callbacks.commit(task, text.trim());
          this.callbacks.settled(task);
        } else if (text.trim()) this.callbacks.partial(task, text.trim());
        else if (filtered.removedMs) this.callbacks.settled(task);
        this.audioFilter?.accepted(task, text);
        if (filtered.removedMs)
          this.callbacks.deduplicated?.(
            task,
            filtered.removedMs,
            !filtered.wav,
          );
      } catch (error) {
        this.callbacks.failed(task, error as Error);
      }
      this.callbacks.pending(this.waiting.size);
      // Bound bookkeeping in long interviews; late callbacks use unique UUIDs.
      if (this.finalizing.size > 2000)
        this.finalizing.delete(this.finalizing.values().next().value!);
    }
    this.running = false;
  }
}
