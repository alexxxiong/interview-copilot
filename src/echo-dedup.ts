import type { TranscriptionTask } from "./live-transcription";

const RATE = 2000;
const WINDOW = 320; // 160 ms: several pitch periods, not a single matching peak.
const MIN_POWER = 0.006 ** 2;
const MATCH = 0.985;
type Reference = {
  sessionId: string;
  chunkId: string;
  start: number;
  samples: Float32Array;
  final: boolean;
};

// Capture emits mono PCM16 WAV. Unknown formats are left untouched.
function readWav(wav: ArrayBuffer) {
  if (!(wav instanceof ArrayBuffer) || wav.byteLength < 44) return null;
  const v = new DataView(wav);
  if (
    v.getUint32(0) !== 0x52494646 ||
    v.getUint32(8) !== 0x57415645 ||
    v.getUint16(20, true) !== 1 ||
    v.getUint16(22, true) !== 1 ||
    v.getUint16(34, true) !== 16 ||
    v.getUint32(36) !== 0x64617461
  )
    return null;
  const rate = v.getUint32(24, true);
  if (rate !== 16000 || v.getUint32(40, true) > wav.byteLength - 44)
    return null;
  const count = v.getUint32(40, true) / 2;
  const samples = new Float32Array(Math.floor(count / 8));
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    for (let j = 0; j < 8; j++)
      sum += v.getInt16(44 + (i * 8 + j) * 2, true) / 32768;
    samples[i] = sum / 8;
  }
  return { samples, count };
}

function correlation(
  mic: Float32Array,
  ref: Float32Array,
  at: number,
  lag: number,
  stride = 1,
) {
  let xy = 0,
    xx = 0,
    yy = 0;
  const end = Math.min(at + WINDOW, mic.length);
  if (at - lag < 0 || end - lag > ref.length) return 0;
  for (let i = at; i < end; i += stride) {
    const x = mic[i],
      y = ref[i - lag];
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  if (xx / ((end - at) / stride) < MIN_POWER || yy < 0.00001) return 0;
  return Math.abs(xy) / Math.sqrt(xx * yy);
}

/** Conservative cross-channel echo removal; never deduplicate by words alone.
 * Only successfully transcribed system audio can explain microphone audio.
 * Final microphone records require finalized references, so failed system ASR
 * cannot silently consume the only successful transcript.
 */
export class EchoDeduplicator {
  private references = new Map<string, Reference>();
  private delays = new Map<string, number>();

  accepted(task: TranscriptionTask, text: string) {
    if (task.chunk.source !== "会议声音" || !text.trim()) return;
    const pcm = readWav(task.chunk.wav);
    const start = Date.parse(task.chunk.capturedAt);
    if (!pcm || !Number.isFinite(start)) return;
    const key = task.sessionId + ":" + task.chunk.chunkId;
    const old = this.references.get(key);
    if (old?.final && !task.final) return;
    this.references.set(key, {
      sessionId: task.sessionId,
      chunkId: task.chunk.chunkId,
      start,
      samples: pcm.samples,
      final: task.final,
    });
    // Short rolling reference window only; no waveform is persisted.
    for (const [id, r] of this.references)
      if (start - (r.start + r.samples.length / 2) > 60000)
        this.references.delete(id);
    while (this.references.size > 64)
      this.references.delete(this.references.keys().next().value!);
    while (this.delays.size > 16)
      this.delays.delete(this.delays.keys().next().value!);
  }

  filter(task: TranscriptionTask): {
    wav: ArrayBuffer | null;
    removedMs: number;
  } {
    const unchanged = { wav: task.chunk.wav, removedMs: 0 };
    if (task.chunk.source !== "麦克风") return unchanged;
    const pcm = readWav(task.chunk.wav);
    const start = Date.parse(task.chunk.capturedAt);
    if (!pcm || !Number.isFinite(start)) return unchanged;
    const mic = pcm.samples;
    // Include up to 800 ms of playback preceding this microphone chunk.
    const pad = 1600,
      base = start - 800;
    const ref = new Float32Array(mic.length + pad + 160);
    let found = false;
    for (const r of this.references.values()) {
      if (r.sessionId !== task.sessionId || (task.final && !r.final)) continue;
      const offset = Math.round(((r.start - base) * RATE) / 1000);
      const from = Math.max(0, -offset),
        to = Math.min(r.samples.length, ref.length - offset);
      if (to <= from) continue;
      ref.set(r.samples.subarray(from, to), offset + from);
      found = true;
    }
    if (!found) return unchanged;
    // Search delay with a few energetic probes, then verify every full window.
    const probes: { at: number; power: number }[] = [];
    for (let at = 0; at + WINDOW <= mic.length; at += WINDOW) {
      let power = 0;
      for (let i = at; i < at + WINDOW; i++) power += mic[i] ** 2;
      if (power / WINDOW > MIN_POWER) probes.push({ at, power });
    }
    if (probes.length < 2) return unchanged;
    const strongest = [
      ...new Set([
        ...[...probes].sort((a, b) => b.power - a.power).slice(0, 2),
        ...Array.from(
          { length: Math.min(8, probes.length) },
          (_, i) =>
            probes[
              Math.floor(
                (i * (probes.length - 1)) / Math.min(7, probes.length - 1),
              )
            ],
        ),
      ]),
    ];
    let bestLag = this.delays.get(task.sessionId) ?? -pad,
      bestScore = 0;
    // Lag is microphone delay minus the padded reference origin. A small
    // negative physical delay tolerates capture callback timestamp jitter.
    const previous = this.delays.get(task.sessionId);
    if (previous !== undefined)
      bestScore = Math.max(
        ...strongest.map((p) => correlation(mic, ref, p.at, previous, 4)),
      );
    const low =
      bestScore >= MATCH ? Math.max(-pad - 160, bestLag - 8) : -pad - 160;
    const high = bestScore >= MATCH ? Math.min(0, bestLag + 8) : 0;
    for (let lag = low; lag <= high; lag++) {
      let score = 0;
      for (const p of strongest)
        score = Math.max(score, correlation(mic, ref, p.at, lag, 4));
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestScore < MATCH) return unchanged;
    const windows = Math.ceil(mic.length / WINDOW);
    const matched = new Uint8Array(windows);
    for (let w = 0; w < windows; w++) {
      const at = w * WINDOW;
      let power = 0;
      const end = Math.min(mic.length, at + WINDOW);
      for (let i = at; i < end; i++) power += mic[i] ** 2;
      if (power / (end - at) < MIN_POWER) {
        matched[w] = 2;
        continue;
      }
      if (mic.length - at < WINDOW / 2) continue;
      let score = 0;
      for (let lag = bestLag - 4; lag <= bestLag + 4; lag++)
        score = Math.max(score, correlation(mic, ref, at, lag));
      if (score >= MATCH) matched[w] = 1;
    }
    // Require sustained agreement, and retain boundaries adjacent to unmatched
    // audio so an interruption/short response is not cut at its onset.
    const ranges: [number, number][] = [];
    for (let w = 0; w < windows; ) {
      if (!matched[w]) {
        w++;
        continue;
      }
      const first = w;
      let confirmed = 0;
      while (w < windows && matched[w]) {
        if (matched[w] === 1) confirmed++;
        w++;
      }
      if (confirmed < 2) continue;
      ranges.push([
        first * WINDOW + (first ? 80 : 0),
        Math.min(mic.length, w * WINDOW) - (w < windows ? 80 : 0),
      ]);
    }
    if (!ranges.length) return unchanged;
    this.delays.set(task.sessionId, bestLag);
    const cleaned = task.chunk.wav.slice(0),
      out = new DataView(cleaned);
    let removed = 0;
    const mask = new Uint8Array(mic.length);
    for (const [from, to] of ranges) {
      mask.fill(1, from, to);
      removed += to - from;
      for (let i = from * 8; i < Math.min(pcm.count, to * 8); i++)
        out.setInt16(44 + i * 2, 0, true);
    }
    // Keep even a brief distinct response. Only all-echo speech can skip ASR.
    let residual = false;
    for (let at = 0; at < mic.length; at += 80) {
      let power = 0;
      const end = Math.min(mic.length, at + 80);
      for (let i = at; i < end; i++) if (!mask[i]) power += mic[i] ** 2;
      if (power / (end - at) > MIN_POWER) {
        residual = true;
        break;
      }
    }
    return {
      wav: residual ? cleaned : null,
      removedMs: (removed * 1000) / RATE,
    };
  }
}
