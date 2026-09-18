import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { safeEndpoint } from "./provider.mjs";
export async function transcribe(wav, settings, signal, local) {
  if (
    wav.length < 44 ||
    wav.subarray(0, 4).toString() !== "RIFF" ||
    wav.subarray(8, 12).toString() !== "WAVE"
  )
    throw Error("需要有效的 WAV 音频。");
  if (settings.asrProvider === "openai") {
    const key = settings.asrKey || settings.apiKey;
    if (!key)
      throw Error("请在设置中填写语音转写 API Key，或改用本地 Whisper。");
    const form = new FormData();
    form.append("file", new Blob([wav], { type: "audio/wav" }), "segment.wav");
    form.append("model", settings.asrModel);
    form.append("language", "zh");
    form.append("response_format", "json");
    if (!settings.asrModel.includes("diarize"))
      form.append(
        "prompt",
        "面试对话。可能涉及：量化交易、高频交易、订单簿、Raft、WAL、幂等、fencing、FIX、C++、线性一致性、序列化、风险控制。仅转写实际语音，不补充内容。",
      );
    const res = await fetch(
      safeEndpoint(settings.asrBase, "audio/transcriptions"),
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.any([
          signal || new AbortController().signal,
          AbortSignal.timeout(90000),
        ]),
      },
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Error(
        `转写接口 ${res.status}：${err.error?.message || res.statusText}`,
      );
    }
    const out = await res.json();
    if (typeof out.text !== "string") throw Error("转写接口未返回文本。");
    return out.text.trim();
  }
  try {
    await access(settings.whisperModel);
  } catch {
    throw Error(
      "本地 Whisper 模型未找到。请运行 npm run setup:asr，或在设置中选择 API 转写。",
    );
  }
  if (local && (await local.prepare(settings)))
    return local.transcribe(wav, signal);
  const dir = await mkdtemp(path.join(tmpdir(), "interview-audio-"));
  try {
    const file = path.join(dir, "segment.wav");
    const out = path.join(dir, "transcript");
    await writeFile(file, wav, { mode: 0o600 });
    await new Promise((resolve, reject) => {
      const child = spawn(
        settings.whisperPath,
        [
          "-m",
          settings.whisperModel,
          "-f",
          file,
          "-l",
          "zh",
          "-otxt",
          "-of",
          out,
          "-np",
          "-nt",
          "-t",
          "4",
        ],
        {
          stdio: ["ignore", "ignore", "pipe"],
          signal: AbortSignal.any([
            signal || new AbortController().signal,
            AbortSignal.timeout(90000),
          ]),
        },
      );
      let err = "";
      child.stderr.on("data", (x) => (err = (err + x).slice(-1500)));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0
          ? resolve()
          : reject(Error(`Whisper 转写失败 (${code})：${err}`)),
      );
    });
    return (await readFile(out + ".txt", "utf8"))
      .trim()
      .replace(/\[.*?\]|\(.*?\)/g, "")
      .trim();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
