import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadTypeScript(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const { LiveTranscriptionQueue } = await loadTypeScript(
  "../src/live-transcription.ts",
);
const { Capture } = await loadTypeScript("../src/audio.ts");
const tick = () => new Promise((resolve) => setImmediate(resolve));
const task = (id, revision, final = false) => ({
  sessionId: "s",
  final,
  chunk: {
    chunkId: id,
    role: "interviewer",
    source: "会议声音",
    capturedAt: "2026-09-17T00:00:00Z",
    wav: revision,
  },
});

test("slow ASR coalesces old previews and gives finalized speech priority without committing partial text", async () => {
  const calls = [],
    commits = [],
    partials = [],
    pending = [];
  let resolve;
  const queue = new LiveTranscriptionQueue({
    transcribe: (wav) => {
      calls.push(wav);
      return new Promise((r) => {
        resolve = r;
      });
    },
    commit: async (task, text) => commits.push([task.chunk.chunkId, text]),
    partial: (task, text) => partials.push([task.chunk.chunkId, text]),
    pending: (n) => pending.push(n),
    settled: () => {},
    failed: () => assert.fail("unexpected failure"),
  });
  queue.submit(task("a", 2));
  queue.submit(task("c", 2));
  queue.submit(task("c", 4));
  queue.submit(task("c", 6));
  queue.submit(task("b", 8, true));
  queue.submit(task("a", 10, true));
  queue.submit(task("a", 12));
  resolve("临时字幕");
  await tick();
  assert.deepEqual(calls, [2, 8]);
  assert.equal(commits.length, 0);
  resolve("乙定稿");
  await tick();
  resolve("甲定稿");
  await tick();
  resolve("最新临时字幕");
  await tick();
  assert.deepEqual(calls, [2, 8, 10, 6]);
  assert.deepEqual(commits, [
    ["b", "乙定稿"],
    ["a", "甲定稿"],
  ]);
  assert.deepEqual(partials, [
    ["a", "临时字幕"],
    ["c", "最新临时字幕"],
  ]);
  assert.equal(pending.at(-1), 0);
});

test("a failed final can be retried and does not block the other audio channel", async () => {
  let fail = true;
  const commits = [],
    failures = [];
  const queue = new LiveTranscriptionQueue({
    transcribe: async () => {
      if (fail) {
        fail = false;
        throw Error("offline");
      }
      return "恢复文本";
    },
    commit: async (task) => commits.push(task.chunk.chunkId),
    partial: () => {},
    settled: () => {},
    pending: () => {},
    failed: (task) => failures.push(task.chunk.chunkId),
  });
  queue.submit(task("a", 1, true));
  await tick();
  queue.submit(task("b", 2, true));
  queue.submit(task("a", 1, true));
  await tick();
  assert.deepEqual(failures, ["a"]);
  assert.deepEqual(commits, ["b", "a"]);
});

test("continuous speech emits cumulative previews before silence, finalizes once, and keeps both speakers distinct", async (t) => {
  const keys = ["AudioContext", "AudioWorkletNode", "MediaStream"];
  const descriptors = keys.map((key) =>
    Object.getOwnPropertyDescriptor(globalThis, key),
  );
  const nodes = [];
  globalThis.AudioContext = class {
    sampleRate = 16000;
    audioWorklet = { addModule: async () => {} };
    destination = {};
    createMediaStreamSource() {
      return { connect() {} };
    }
    async resume() {}
    async close() {}
  };
  globalThis.AudioWorkletNode = class {
    port = {};
    constructor() {
      nodes.push(this);
    }
    connect() {}
  };
  globalThis.MediaStream = class {
    constructor(tracks) {
      this.tracks = tracks;
    }
    getAudioTracks() {
      return this.tracks;
    }
    getTracks() {
      return this.tracks;
    }
  };
  t.after(() =>
    keys.forEach((key, i) =>
      descriptors[i]
        ? Object.defineProperty(globalThis, key, descriptors[i])
        : delete globalThis[key],
    ),
  );
  const capture = new Capture(),
    previews = [],
    finals = [],
    speech = [];
  const stream = () => new MediaStream([{ addEventListener() {}, stop() {} }]);
  for (const [role, source] of [
    ["candidate", "麦克风"],
    ["interviewer", "会议声音"],
  ])
    await capture.attach(
      stream(),
      role,
      source,
      (c) => finals.push(c),
      () => {},
      () => {},
      (c) => previews.push(c),
      (c) => speech.push(c),
    );
  const feed = (node, frames, amplitude) => {
    for (let i = 0; i < frames; i++)
      node.port.onmessage({ data: new Float32Array(128).fill(amplitude) });
  };
  for (const node of nodes) feed(node, 750, 0.1); // Six seconds without a pause.
  assert.equal(finals.length, 0);
  assert.equal(speech.length, 2);
  assert.ok(previews.length >= 4);
  assert.notEqual(speech[0].chunkId, speech[1].chunkId);
  assert.deepEqual(
    new Set(previews.map((c) => c.role)),
    new Set(["candidate", "interviewer"]),
  );
  for (const node of nodes) feed(node, 130, 0);
  assert.equal(finals.length, 2);
  for (const c of finals) {
    assert.ok(
      previews.some(
        (p) => p.chunkId === c.chunkId && p.wav.byteLength < c.wav.byteLength,
      ),
    );
    assert.equal(new DataView(c.wav).getUint32(24, true), 16000);
  }
  capture.stop();
  assert.equal(finals.length, 2);
});
