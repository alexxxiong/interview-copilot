import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

export class LocalWhisper {
  active = null;
  closed = false;
  async prepare(settings) {
    if (settings.asrProvider !== "local") return false;
    const binary = path.join(
      path.dirname(settings.whisperPath),
      "whisper-server",
    );
    if (!existsSync(binary)) return false; // Preserve custom whisper-cli setups.
    if (this.closed) throw Error("转写服务已关闭。");
    const key = binary + "\n" + settings.whisperModel;
    if (this.active?.key === key) return this.active.ready;
    this.stop();
    const active = {
      key,
      child: null,
      url: "",
      error: "",
      dir: "",
      ready: null,
    };
    this.active = active;
    active.ready = this.start(active, binary, settings.whisperModel).catch(
      (error) => {
        if (this.active === active) this.stop();
        throw error;
      },
    );
    return active.ready;
  }
  async start(active, binary, model) {
    const reservation = createServer();
    await new Promise((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", resolve);
    });
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    active.dir = await mkdtemp(path.join(tmpdir(), "interview-whisper-"));
    if (this.closed || this.active !== active) {
      await rm(active.dir, { recursive: true, force: true });
      throw Error("转写服务启动已取消。");
    }
    const prefix = "/" + randomUUID();
    active.url = `http://127.0.0.1:${port}${prefix}`;
    const child = spawn(
      binary,
      [
        "-m",
        model,
        "-l",
        "zh",
        "-t",
        "4",
        "-nt",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--request-path",
        prefix,
        "--public",
        active.dir,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    active.child = child;
    let diagnostic = "";
    child.stderr.on("data", (chunk) => {
      diagnostic = (diagnostic + chunk).slice(-1200);
    });
    child.on("error", (error) => {
      active.error = error.message;
    });
    child.on("close", (code) => {
      active.error ||= `Whisper 服务已退出 (${code})：${diagnostic}`;
      if (this.active === active) this.active = null;
      void rm(active.dir, { recursive: true, force: true });
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (active.error) throw Error(active.error);
      if (this.closed || this.active !== active)
        throw Error("转写服务启动已取消。");
      const ready = await fetch(active.url + "/health", {
        signal: AbortSignal.timeout(500),
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (ready) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error("Whisper 模型加载超时，请检查本地模型路径。");
  }
  async transcribe(wav, signal) {
    const active = this.active;
    if (!active || active.error)
      throw Error(active?.error || "本地转写服务未启动。");
    const form = new FormData();
    form.append("file", new Blob([wav], { type: "audio/wav" }), "segment.wav");
    form.append("response_format", "json");
    form.append("language", "zh");
    const response = await fetch(active.url + "/inference", {
      method: "POST",
      body: form,
      signal: AbortSignal.any([
        signal || new AbortController().signal,
        AbortSignal.timeout(90000),
      ]),
    });
    const result = await response.json();
    if (!response.ok || typeof result.text !== "string")
      throw Error(result.error || "本地转写服务未返回文本。");
    return result.text
      .trim()
      .replace(/\[.*?\]|\(.*?\)/g, "")
      .trim();
  }
  stop() {
    const active = this.active;
    this.active = null;
    active?.child?.kill("SIGTERM");
  }
  close() {
    this.closed = true;
    this.stop();
  }
}
