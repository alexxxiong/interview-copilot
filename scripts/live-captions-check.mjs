// Real-time paced PCM fixture -> capture segmentation -> coalescing queue ->
// HTTP -> persistent local Whisper -> finalized session. No microphone recording.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { startServer } from "../server/index.mjs";

async function loadTs(file) {
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
const { Capture } = await loadTs("../src/audio.ts");
const { LiveTranscriptionQueue } = await loadTs("../src/live-transcription.ts");
const { EchoDeduplicator } = await loadTs("../src/echo-dedup.ts");
const echoMode = process.argv.includes("--echo");
const dir = await mkdtemp(path.join(tmpdir(), "interview-live-check-"));
const server = await startServer({ port: 0, dataDir: dir });
const source = await readFile(
  new URL("../artifacts/asr-test.wav", import.meta.url),
);
assert.equal(source.readUInt32LE(24), 16000);
assert.equal(source.readUInt16LE(22), 1);
let offset = 12,
  pcm;
while (offset + 8 < source.length) {
  const length = source.readUInt32LE(offset + 4);
  if (source.toString("ascii", offset, offset + 4) === "data") {
    pcm = source.subarray(offset + 8, offset + 8 + length);
    break;
  }
  offset += 8 + length + (length % 2);
}
assert.ok(pcm);
const samples = new Float32Array(pcm.length / 2);
for (let i = 0; i < samples.length; i++)
  samples[i] = pcm.readInt16LE(i * 2) / 32768;
const nodes = [],
  events = [],
  errors = [],
  deduplicated = [];
let pending = 0,
  token = "",
  started = 0;
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
const capture = new Capture();
async function json(url, body, method = "POST") {
  const response = await fetch(server.url + url, {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
try {
  const state = await fetch(server.url + "/api/state").then((r) => r.json());
  token = state.csrfToken;
  const sessionId = state.sessions[0].id;
  await json("/api/settings", { autoDetect: false }, "PUT");
  await json("/api/transcribe/prepare", {});
  const queue = new LiveTranscriptionQueue(
    {
      transcribe: async (wav) => {
        const r = await fetch(server.url + "/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "audio/wav", "X-CSRF-Token": token },
          body: wav,
        });
        const data = await r.json();
        if (!r.ok) throw Error(data.error);
        return data.text;
      },
      pending: (n) => {
        pending = n;
      },
      deduplicated: (task, removedMs, empty) => {
        deduplicated.push({
          final: task.final,
          role: task.chunk.role,
          removedMs,
          empty,
        });
      },
      partial: (task, text) => {
        const event = {
          phase: "partial",
          role: task.chunk.role,
          ms: Math.round(performance.now() - started),
          text,
        };
        events.push(event);
        console.log(JSON.stringify(event));
      },
      commit: async (task, text) => {
        await json(`/api/sessions/${sessionId}/transcripts`, {
          ...task.chunk,
          wav: undefined,
          text,
        });
        events.push({
          phase: "final",
          role: task.chunk.role,
          chunkId: task.chunk.chunkId,
          ms: Math.round(performance.now() - started),
          text,
        });
      },
      settled: () => {},
      failed: (_task, error) => errors.push(error.message),
    },
    echoMode ? new EchoDeduplicator() : undefined,
  );
  for (const [role, name] of [
    ["candidate", "麦克风"],
    ["interviewer", "会议声音"],
  ]) {
    const stream = new MediaStream([{ addEventListener() {}, stop() {} }]);
    await capture.attach(
      stream,
      role,
      name,
      (chunk) => queue.submit({ chunk, sessionId, final: true }),
      () => {},
      () => {},
      (chunk) => queue.submit({ chunk, sessionId, final: false }),
    );
  }
  started = performance.now();
  const delay = echoMode ? 3200 : 0;
  const end = samples.length + 16000 + delay;
  for (let at = 0; at < end; at += 512) {
    for (let sub = at; sub < at + 512; sub += 128) {
      const frame = new Float32Array(128);
      if (sub < samples.length) frame.set(samples.subarray(sub, sub + 128));
      for (const [index, node] of nodes.entries()) {
        if (echoMode && index === 0) {
          const echo = new Float32Array(128);
          for (let i = 0; i < echo.length; i++) {
            const offset = sub + i - delay;
            echo[i] =
              (samples[offset] || 0) * 0.45 +
              (samples[offset - 96] || 0) * 0.03;
          }
          node.port.onmessage({ data: echo });
        } else node.port.onmessage({ data: frame });
      }
    }
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, (at + 512) / 16 - (performance.now() - started)),
      ),
    );
  }
  capture.stop();
  const deadline = Date.now() + 40000;
  while (pending && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(pending, 0);
  assert.deepEqual(errors, []);
  for (const role of echoMode
    ? ["interviewer"]
    : ["candidate", "interviewer"]) {
    assert.ok(
      events.some(
        (e) =>
          e.phase === "partial" &&
          e.role === role &&
          e.ms < samples.length / 16,
      ),
    );
    assert.ok(events.some((e) => e.phase === "final" && e.role === role));
  }
  const result = await fetch(server.url + "/api/state").then((r) => r.json());
  const session = result.sessions[0];
  assert.equal(session.jobs.length, 0);
  if (echoMode) {
    assert.equal(
      session.transcripts.length,
      1,
      "echo must not create a second final transcript",
    );
    assert.equal(session.transcripts[0].role, "interviewer");
    assert.ok(deduplicated.some((d) => d.final && d.empty));
  }
  assert.equal(
    session.transcripts.length,
    new Set(session.transcripts.map((t) => t.chunkId)).size,
  );
  assert.match(
    session.transcripts.map((t) => t.text).join(""),
    /订单|量化|高频/,
  );
  await writeFile(
    new URL(
      echoMode
        ? "../artifacts/echo-captions-check.json"
        : "../artifacts/live-captions-check.json",
      import.meta.url,
    ),
    JSON.stringify(
      {
        audioSeconds: samples.length / 16000,
        events,
        deduplicated,
        transcripts: session.transcripts,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${echoMode ? "delayed speaker echo deduplicated" : "both speakers visible before speech ends"}; ${session.transcripts.length} unique finalized records; no agent jobs from previews.`,
  );
} finally {
  capture.stop();
  await server.close();
  await rm(dir, { recursive: true, force: true });
}
