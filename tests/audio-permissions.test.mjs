import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../src/audio.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const { systemAudioStream } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function mock(t, getDisplayMedia, screen = "granted") {
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getDisplayMedia } },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      desktop: { mediaStatus: async () => ({ platform: "darwin", screen }) },
    },
  });
  t.after(() => {
    for (const [key, descriptor] of [
      ["navigator", oldNavigator],
      ["window", oldWindow],
    ]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
}

test("video-only picker result releases the screen and does not misreport denied permission", async (t) => {
  let stopped = false;
  mock(t, async () => ({
    getAudioTracks: () => [],
    getTracks: () => [
      {
        stop: () => {
          stopped = true;
        },
      },
    ],
  }));
  await assert.rejects(systemAudioStream, /未返回可用音轨/);
  assert.equal(stopped, true);
});

test("a dead loopback track is rejected and every track is released", async (t) => {
  let stopped = 0;
  const track = {
    readyState: "ended",
    stop: () => {
      stopped++;
    },
  };
  mock(t, async () => ({
    getAudioTracks: () => [track],
    getTracks: () => [track, track],
  }));
  await assert.rejects(systemAudioStream, /未返回可用音轨/);
  assert.equal(stopped, 2);
});

test("OS denial and backend failure provide different recovery instructions", async (t) => {
  mock(
    t,
    async () => {
      throw Error("capture failed");
    },
    "denied",
  );
  await assert.rejects(systemAudioStream, /录屏与系统录音/);
  window.desktop.mediaStatus = async () => ({
    platform: "darwin",
    screen: "granted",
  });
  await assert.rejects(systemAudioStream, /系统音频启动失败：capture failed/);
});
