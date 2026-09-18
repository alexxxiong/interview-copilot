import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const dir = await mkdtemp(path.join(tmpdir(), "interview-audio-e2e-"));
const app = await electron.launch({
  args: [".", `--user-data-dir=${path.join(dir, "electron-user")}`],
  env: { ...process.env, INTERVIEW_PORT: "4322", INTERVIEW_DATA_DIR: dir },
});
try {
  const page = await app.firstWindow();
  await page.waitForSelector(".workspace-columns");
  await page.getByRole("switch", { name: "自动识别问题" }).click();
  const bytes = (await readFile("artifacts/asr-test.wav")).toString("base64");
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ctx = new AudioContext({ sampleRate: 16000 });
    const data = await ctx.decodeAudioData(bytes.buffer);
    const streamFor = async () => {
      const destination = ctx.createMediaStreamDestination();
      await ctx.resume();
      const node = ctx.createBufferSource();
      node.buffer = data;
      node.connect(destination);
      node.start(ctx.currentTime + 1);
      return destination.stream;
    };
    navigator.mediaDevices.getUserMedia = streamFor;
    navigator.mediaDevices.getDisplayMedia = streamFor;
  }, bytes);
  await page.getByRole("button", { name: "开始采集", exact: true }).click();
  await page.getByRole("button", { name: "停止采集", exact: true }).waitFor();
  await page
    .locator(".transcript-item.candidate")
    .first()
    .waitFor({ timeout: 50000 });
  await page
    .locator(".transcript-item.interviewer")
    .first()
    .waitFor({ timeout: 50000 });
  await page.getByRole("button", { name: "停止采集", exact: true }).click();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".panel-title")
        ?.textContent?.includes("实时转写中"),
    null,
    { timeout: 50000 },
  );
  const text = await page.locator(".transcript-scroll").innerText();
  assert.match(text, /高频|量化|订单/);
  assert.match(text, /麦克风/);
  assert.match(text, /会议声音/);
  assert.match(text, /面试官/);
  assert.match(text, /我/);
  await page.screenshot({ path: "artifacts/audio-capture-tested.png" });
  console.log(
    "PASS: synthetic Chinese audio -> real AudioWorklet/VAD -> PCM WAV -> local Whisper -> separate candidate and interviewer transcripts.",
  );
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
