import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(file) {
  const { outputText } = ts.transpileModule(
    await readFile(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    },
  );
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const { EchoDeduplicator } = await load("../src/echo-dedup.ts");
const { LiveTranscriptionQueue } = await load("../src/live-transcription.ts");
const { encodeWav } = await load("../src/audio.ts");
const base = Date.parse("2026-09-17T00:00:00Z");
function signal(seconds = 3, seed = 1) {
  let prior = 0;
  return Float32Array.from({ length: seconds * 16000 }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    prior = prior * 0.8 + (seed / 2 ** 32 - 0.5) * 0.2;
    return prior * (0.6 + 0.4 * Math.sin(i / 1600) ** 2);
  });
}
function task(
  samples,
  source = "麦克风",
  start = 0,
  final = true,
  sessionId = "s",
  chunkId = source + start,
) {
  return {
    sessionId,
    final,
    chunk: {
      source,
      role: source === "会议声音" ? "interviewer" : "candidate",
      chunkId,
      capturedAt: new Date(base + start).toISOString(),
      wav: encodeWav(samples),
    },
  };
}
const energy = (wav, from = 0, to = Infinity) => {
  const v = new DataView(wav);
  let power = 0;
  for (
    let i = from * 16000;
    i < Math.min((wav.byteLength - 44) / 2, to * 16000);
    i++
  )
    power += v.getInt16(44 + i * 2, true) ** 2;
  return power;
};

test("delayed quieter acoustic copy is removed, including polarity inversion and low background noise", () => {
  for (const gain of [0.3, -0.55]) {
    const d = new EchoDeduplicator(),
      system = signal();
    d.accepted(task(system, "会议声音"), "同一问题");
    const mic = system.map((x, i) => x * gain + Math.sin(i * 2.7) * 0.0003);
    const result = d.filter(task(mic, "麦克风", 180));
    assert.ok(
      result.removedMs > 2800,
      JSON.stringify({ removed: result.removedMs }),
    );
    assert.ok(result.wav === null, "all echo should skip ASR");
  }
});

test("matching words alone, later repetitions, another session, imports, and mic-only recordings are never removed", () => {
  const d = new EchoDeduplicator(),
    system = signal();
  d.accepted(task(system, "会议声音"), "如何保证严格一致性");
  for (const t of [
    task(signal(3, 7)),
    task(system, "麦克风", 5000),
    task(system, "麦克风", 0, true, "other"),
    task(system, "导入音频"),
    task(system, "会议声音"),
  ])
    assert.equal(d.filter(t).removedMs, 0);
  assert.equal(new EchoDeduplicator().filter(task(system)).removedMs, 0);
});

test("remove an echo prefix while retaining the candidate's new answer and simultaneous independent speech", () => {
  const d = new EchoDeduplicator(),
    system = signal(4),
    own = signal(4, 39);
  d.accepted(task(system, "会议声音"), "面试官问题");
  const mic = system.map((x, i) => (i < 2 * 16000 ? x * 0.4 : own[i]));
  const t = task(mic),
    result = d.filter(t);
  assert.ok(result.removedMs > 1400);
  assert.ok(energy(result.wav, 0, 1.6) < energy(t.chunk.wav, 0, 1.6) * 0.05);
  assert.equal(energy(result.wav, 2.2, 4), energy(t.chunk.wav, 2.2, 4));
  const simultaneous = system.map((x, i) => x * 0.4 + own[i]);
  assert.equal(d.filter(task(simultaneous)).removedMs, 0);
});

test("split system chunks explain one microphone chunk; unsuccessful or unfinished system transcripts cannot erase a final", () => {
  const d = new EchoDeduplicator(),
    system = signal(4);
  d.accepted(task(system, "会议声音", 0, false), "临时字幕");
  assert.equal(d.filter(task(system)).removedMs, 0);
  assert.ok(d.filter(task(system, "麦克风", 0, false)).removedMs > 3000);
  d.accepted(task(system, "会议声音"), "");
  assert.equal(d.filter(task(system)).removedMs, 0);
  d.accepted(task(system.slice(0, 32000), "会议声音"), "第一段");
  d.accepted(task(system.slice(32000), "会议声音", 2000), "第二段");
  assert.ok(d.filter(task(system, "麦克风", 110)).wav === null);
});

test("actual spoken fixture with gain, room reflection and trailing silence is deduplicated", async (t) => {
  let raw;
  try {
    raw = await readFile(new URL("../artifacts/asr-test.wav", import.meta.url));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return t.skip(
      "Optional spoken fixture is not included in the public repository.",
    );
  }
  let at = 12,
    pcm;
  while (at + 8 < raw.length) {
    const size = raw.readUInt32LE(at + 4);
    if (raw.toString("ascii", at, at + 4) === "data") {
      pcm = raw.subarray(at + 8, at + 8 + size);
      break;
    }
    at += 8 + size + (size % 2);
  }
  const system = new Float32Array(pcm.length / 2 + 16000);
  for (let i = 0; i < pcm.length / 2; i++)
    system[i] = pcm.readInt16LE(i * 2) / 32768;
  const mic = system.map((x, i) => x * 0.5 + (system[i - 96] || 0) * 0.04);
  const d = new EchoDeduplicator();
  d.accepted(task(system, "会议声音"), "高频交易问题");
  const result = d.filter(task(mic, "麦克风", 137));
  assert.ok(result.removedMs > 5000);
  assert.ok(
    result.wav === null,
    "spoken echo must not produce a second caption",
  );
});

test("queue accepts microphone first, commits a single system record, and retains mic when system transcription fails", async () => {
  for (const failSystem of [false, true]) {
    const commits = [],
      dedup = [],
      errors = [],
      system = signal();
    let done;
    const finished = new Promise((resolve) => {
      done = resolve;
    });
    const queue = new LiveTranscriptionQueue(
      {
        transcribe: async (wav) => {
          if (failSystem && wav === sys.chunk.wav)
            throw Error("ASR unavailable");
          return "如何保证交易的严格一致性";
        },
        commit: async (t) => commits.push(t.chunk.source),
        partial: () => {},
        settled: () => {},
        failed: (t) => errors.push(t.chunk.source),
        pending: (n) => {
          if (!n) done();
        },
        deduplicated: (t) => dedup.push(t.chunk.source),
      },
      new EchoDeduplicator(),
    );
    const sys = task(system, "会议声音"),
      mic = task(
        system.map((x) => x * 0.5),
        "麦克风",
        150,
      );
    queue.submit(mic);
    queue.submit(sys);
    await finished;
    assert.deepEqual(commits, failSystem ? ["麦克风"] : ["会议声音"]);
    assert.deepEqual(dedup, failSystem ? [] : ["麦克风"]);
    assert.deepEqual(errors, failSystem ? ["会议声音"] : []);
  }
});
