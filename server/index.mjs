import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { z } from "zod";
import { Store } from "./store.mjs";
import { Engine } from "./engine.mjs";
import { transcribe } from "./transcribe.mjs";
import { LocalWhisper } from "./local-whisper.mjs";
import { Category } from "./schemas.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function startServer({
  port = 4318,
  dataDir = path.join(root, ".data"),
  crypto,
  model,
} = {}) {
  const app = express(),
    store = new Store(dataDir, crypto),
    clients = new Set();
  const csrfToken = randomBytes(32).toString("hex");
  const publish = (event) => {
    for (const res of clients) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const engine = new Engine(store, publish, model);
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    if (!["127.0.0.1", "localhost"].includes(host))
      return res.status(403).json({ error: "仅允许本机访问" });
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ error: "拒绝跨站请求" });
    if (req.headers.origin) {
      try {
        const o = new URL(req.headers.origin);
        if (!["127.0.0.1", "localhost"].includes(o.hostname))
          return res.status(403).json({ error: "来源无效" });
      } catch {
        return res.sendStatus(403);
      }
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-csrf-token"] !== csrfToken
    )
      return res.status(403).json({ error: "请求凭证过期，请刷新页面" });
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/state", (_req, res) =>
    res.json({
      csrfToken,
      settings: store.publicSettings(),
      sessions: store.sessions,
      library: store.publicLibrary(),
    }),
  );
  app.get("/api/events", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write('data: {"type":"connected"}\n\n');
    clients.add(res);
    const t = setInterval(() => res.write(": heartbeat\n\n"), 20000);
    req.on("close", () => {
      clients.delete(res);
      clearInterval(t);
    });
  });
  app.put("/api/settings", (req, res) => {
    const result = store.saveSettings(req.body);
    publish({
      type: "settings",
      settings: result,
      libraryContextKey: store.libraryKey(),
    });
    res.json(result);
  });
  app.post("/api/sessions", (_req, res) => {
    const session = store.newSession();
    publish({ type: "session", session });
    res.status(201).json(session);
  });
  app.post("/api/sessions/:id/transcripts", (req, res) => {
    const data = z
      .object({
        text: z.string().trim().min(1).max(16000),
        role: z.enum(["interviewer", "candidate", "unknown"]),
        source: z.string().default("manual"),
        chunkId: z.string().optional(),
        capturedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    res.json(engine.addTranscript(store.get(req.params.id), data));
  });
  app.patch("/api/sessions/:id/transcripts/:tid", (req, res) => {
    const s = store.get(req.params.id),
      t = s.transcripts.find((t) => t.id === req.params.tid);
    if (!t) return res.sendStatus(404);
    Object.assign(
      t,
      z
        .object({
          text: z.string().trim().min(1).max(16000),
          role: z.enum(["interviewer", "candidate", "unknown"]),
        })
        .parse(req.body),
    );
    s.detectedIds = s.detectedIds.filter((id) => id !== t.id);
    engine.changed(s);
    if (t.role === "interviewer" && store.settings.autoDetect)
      engine.scheduleDetection(s);
    res.json(s);
  });
  app.post("/api/sessions/:id/detect", (req, res) => {
    const s = store.get(req.params.id);
    void engine.detect(s);
    res.json({ ok: true });
  });
  app.post("/api/sessions/:id/questions", (req, res) => {
    const data = z
      .object({
        question: z.string().trim().min(2).max(6000),
        category: Category.default("technical"),
      })
      .parse(req.body);
    res.status(202).json(engine.enqueue(store.get(req.params.id), data));
  });
  app.post("/api/sessions/:id/jobs/:jid/:action", (req, res) => {
    const s = store.get(req.params.id),
      j = s.jobs.find((j) => j.id === req.params.jid);
    if (!j) return res.sendStatus(404);
    if (req.params.action === "cancel") engine.cancel(s, j);
    else if (req.params.action === "retry") engine.retry(s, j);
    else return res.sendStatus(404);
    res.json(j);
  });
  let audioTail = Promise.resolve(),
    audioPending = 0;
  const localWhisper = new LocalWhisper();
  app.post("/api/transcribe/prepare", async (_req, res) => {
    const settings = { ...store.settings };
    const work = audioTail.then(() => localWhisper.prepare(settings));
    audioTail = work.catch(() => {});
    try {
      res.json({ ready: true, persistent: await work });
    } catch (error) {
      res.status(502).json({ error: error.message });
    }
  });
  app.post(
    "/api/transcribe",
    express.raw({ type: "audio/wav", limit: "12mb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        return res.status(400).json({ error: "需要 WAV 音频" });
      if (audioPending >= 12)
        return res
          .status(429)
          .json({ error: "转写积压，请暂停采集，待已有片段处理完成。" });
      const settings = { ...store.settings };
      audioPending++;
      const work = audioTail.then(() =>
        transcribe(req.body, settings, undefined, localWhisper),
      );
      audioTail = work.catch(() => {});
      try {
        res.json({ text: await work });
      } catch (error) {
        res.status(502).json({ error: error.message });
      } finally {
        audioPending--;
      }
    },
  );
  app.get("/api/health", async (_req, res) => {
    const codex = await new Promise((resolve) => {
      const child = spawn(store.settings.codexPath, ["login", "status"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 5000,
      });
      let message = "";
      child.stdout.on("data", (x) => (message += x));
      child.stderr.on("data", (x) => (message += x));
      child.on("error", () =>
        resolve({ ok: false, message: "未找到 Codex CLI" }),
      );
      child.on("close", (code) =>
        resolve({ ok: code === 0, message: message.trim().slice(0, 300) }),
      );
    });
    res.json({
      codex,
      asr: {
        provider: store.settings.asrProvider,
        modelExists: existsSync(store.settings.whisperModel),
        binaryExists: existsSync(store.settings.whisperPath),
      },
      modelConfigured:
        store.settings.provider === "codex" || !!store.settings.apiKey,
    });
  });
  app.use(express.static(path.join(root, "dist")));
  app.get("/", (_req, res) =>
    res.sendFile(path.join(root, "dist", "index.html")),
  );
  app.use((error, _req, res, _next) => {
    res.status(error instanceof z.ZodError ? 400 : error.status || 500).json({
      error:
        error instanceof z.ZodError
          ? error.issues
              .map((x) => `${x.path.join(".")}：${x.message}`)
              .join("；")
          : error.message,
    });
  });
  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
    s.on("error", reject);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    store,
    engine,
    closeAudio: () => localWhisper.close(),
    close: () => {
      localWhisper.close();
      engine.close();
      for (const res of clients) res.end();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await startServer({
    port: Number(process.env.INTERVIEW_PORT || 4318),
  });
  console.log(`面试助手 ${server.url}`);
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, async () => {
      await server.close();
      process.exit(0);
    });
}
