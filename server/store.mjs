import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { homedir } from "node:os";
import { Settings } from "./schemas.mjs";
export class Store {
  constructor(dir, crypto) {
    this.dir = dir;
    this.crypto = crypto;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const saved = this.read("settings.json", {});
    this.settings = Settings.parse({
      ...saved,
      apiKey: this.decode(saved.apiKey),
      asrKey: this.decode(saved.asrKey),
    });
    if (!this.settings.whisperModel)
      this.settings.whisperModel = path.join(
        homedir(),
        "Library",
        "Application Support",
        "InterviewCopilot",
        "models",
        "ggml-small.bin",
      );
    this.sessions = this.read("sessions.json", []);
    this.library = this.read("question-library.json", {
      id: "question-library",
      title: "问题卡片",
      createdAt: new Date().toISOString(),
      transcripts: [],
      jobs: [],
      detectedIds: [],
    });
    for (const session of [...this.sessions, this.library])
      for (const job of session.jobs)
        if (["queued", "researching", "reviewing"].includes(job.status)) {
          job.status = "failed";
          job.error = "应用上次关闭时任务尚未完成，可重试。";
        }
    if (!this.sessions.length) this.newSession();
  }
  read(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.dir, file), "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return fallback;
      throw Error(`${file} 读取失败：${e.message}`);
    }
  }
  write(file, data) {
    const dest = path.join(this.dir, file);
    fs.writeFileSync(dest + ".tmp", JSON.stringify(data, null, 2), {
      mode: 0o600,
    });
    fs.renameSync(dest + ".tmp", dest);
  }
  decode(value) {
    if (!value) return "";
    if (value.startsWith("encrypted:") && this.crypto)
      return this.crypto.decryptString(Buffer.from(value.slice(10), "base64"));
    return "";
  }
  encode(value) {
    return value && this.crypto
      ? "encrypted:" + this.crypto.encryptString(value).toString("base64")
      : "";
  }
  publicSettings() {
    const { apiKey, asrKey, ...rest } = this.settings;
    return {
      ...rest,
      hasApiKey: !!apiKey,
      hasAsrKey: !!asrKey,
      keysPersisted: !!this.crypto,
    };
  }
  saveSettings(input) {
    this.settings = Settings.parse({ ...this.settings, ...input });
    this.write("settings.json", {
      ...this.settings,
      apiKey: this.encode(this.settings.apiKey),
      asrKey: this.encode(this.settings.asrKey),
    });
    return this.publicSettings();
  }
  newSession() {
    const session = {
      id: randomUUID(),
      title: "量化开发 · 面试会话",
      createdAt: new Date().toISOString(),
      transcripts: [],
      jobs: [],
      detectedIds: [],
      detectionError: null,
    };
    this.sessions.unshift(session);
    this.save();
    return session;
  }
  save() {
    this.write("sessions.json", this.sessions);
    this.write("question-library.json", this.library);
  }
  libraryKey() {
    return createHash("sha256")
      .update(this.settings.role + "\n" + this.settings.profile)
      .digest("hex");
  }
  publicLibrary() {
    return { ...this.library, contextKey: this.libraryKey() };
  }
  get(id) {
    if (id === this.library.id) return this.library;
    const s = this.sessions.find((s) => s.id === id);
    if (!s) throw Object.assign(Error("会话不存在"), { status: 404 });
    return s;
  }
}
