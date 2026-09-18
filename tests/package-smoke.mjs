import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const dir = await mkdtemp(path.join(tmpdir(), "interview-package-"));
const session = JSON.parse(
  await readFile("artifacts/live-data/sessions.json", "utf8"),
)[0];
assert.equal(session.jobs[0].status, "completed");
await writeFile(path.join(dir, "sessions.json"), JSON.stringify([session]));
const app = await electron.launch({
  executablePath: path.resolve(
    "release/mac-arm64/面试助手.app/Contents/MacOS/面试助手",
  ),
  args: [`--user-data-dir=${path.join(dir, "electron-user")}`],
  env: { ...process.env, INTERVIEW_PORT: "4323", INTERVIEW_DATA_DIR: dir },
});
try {
  const page = await app.firstWindow();
  await page.locator(".lead-answer").waitFor();
  assert.match(await page.locator(".lead-answer").innerText(), /一致性|订单/);
  await page.screenshot({ path: "artifacts/workspace-answer.png" });
  const newWindow = app.waitForEvent("window");
  await page.getByRole("button", { name: "置顶提示窗", exact: false }).click();
  const overlay = await newWindow;
  await overlay.locator(".lead-answer").waitFor();
  await overlay.waitForFunction(
    () => document.querySelector(".overlay-scroll").scrollTop < 5,
  );
  await overlay.getByRole("button", { name: "跟随最新", exact: false }).click();
  await overlay
    .locator(".overlay-scroll")
    .evaluate((e) => e.scrollTo({ top: 0, behavior: "instant" }));
  await overlay.screenshot({ path: "artifacts/overlay-answer.png" });
  const health = await page.evaluate(() =>
    fetch("/api/health").then((r) => r.json()),
  );
  assert.equal(health.codex.ok, true);
  assert.equal(health.asr.modelExists, true);
  assert.equal(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes("overlay=1"))
        .isAlwaysOnTop(),
    ),
    true,
  );
  console.log(
    "PASS: packaged .app launches, renders real Agent answer, opens pinned overlay, finds Codex login and ASR model.",
  );
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
