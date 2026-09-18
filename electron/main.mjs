import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  safeStorage,
  shell,
  globalShortcut,
  systemPreferences,
  screen,
} from "electron";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../server/index.mjs";
import { sameOrigin } from "./media-origin.mjs";
import { createCardWindows } from "./card-windows.mjs";
const dirname = path.dirname(fileURLToPath(import.meta.url));
app.setName("面试助手");
// Use the Screen & System Audio permission the user grants in macOS Settings.
// CoreAudio Tap uses a separate permission and can produce a dead audio track.
if (process.platform === "darwin")
  app.commandLine.appendSwitch(
    "disable-features",
    "MacCatapLoopbackAudioForScreenShare",
  );
process.env.PATH = [
  process.env.PATH,
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin",
]
  .filter(Boolean)
  .join(path.delimiter);
if (!app.requestSingleInstanceLock()) app.quit();
let main, overlay, server;
let captureDiagnostic = null;
const opts = {
  preload: path.join(dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  backgroundThrottling: false,
};
function secure(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(server.url + "/") && url !== server.url)
      event.preventDefault();
  });
}
async function openOverlay() {
  if (overlay && !overlay.isDestroyed()) {
    overlay.show();
    return;
  }
  overlay = new BrowserWindow({
    width: 530,
    height: 740,
    minWidth: 370,
    minHeight: 360,
    alwaysOnTop: true,
    title: "面试助手 · 置顶提示",
    backgroundColor: "#141918",
    titleBarStyle: "hiddenInset",
    webPreferences: opts,
  });
  overlay.setAlwaysOnTop(true, "floating");
  // Fullscreen overlay mode hides the entire app from the macOS Dock.
  // Keep ordinary desktop pinning and the normal application identity.
  overlay.setVisibleOnAllWorkspaces(true);
  secure(overlay);
  await overlay.loadURL(server.url + "/?overlay=1");
}
app
  .whenReady()
  .then(async () => {
    server = await startServer({
      port: Number(process.env.INTERVIEW_PORT || 4318),
      dataDir:
        process.env.INTERVIEW_DATA_DIR ||
        path.join(app.getPath("userData"), "interview-data"),
      // Do not open Keychain during startup when no API keys are in use.
      // A signature update can otherwise block even local Codex/Whisper users.
      crypto: {
        encryptString(value) {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error("钥匙串不可用，无法安全保存 API Key。");
          return safeStorage.encryptString(value);
        },
        decryptString(value) {
          if (!safeStorage.isEncryptionAvailable())
            throw new Error("钥匙串不可用，无法读取 API Key。");
          return safeStorage.decryptString(value);
        },
      },
    });
    session.defaultSession.setPermissionRequestHandler(
      (wc, permission, callback) =>
        callback(
          sameOrigin(wc?.getURL(), server.url) &&
            ["media", "display-capture"].includes(permission),
        ),
    );
    session.defaultSession.setPermissionCheckHandler(
      (wc, permission) =>
        sameOrigin(wc?.getURL(), server.url) &&
        ["media", "display-capture"].includes(permission),
    );
    session.defaultSession.setDisplayMediaRequestHandler(
      async (request, callback) => {
        captureDiagnostic = {
          origin: request.securityOrigin,
          stage: "requested",
          error: "",
        };
        // Electron serializes this GURL with a trailing slash on macOS.
        if (!sameOrigin(request.securityOrigin, server.url)) {
          captureDiagnostic.error = "音频请求来源无效。";
          return callback({});
        }
        try {
          const sources = await desktopCapturer.getSources({
            types: ["screen"],
            thumbnailSize: { width: 0, height: 0 },
          });
          if (!sources.length) {
            captureDiagnostic.error =
              "系统未提供屏幕音频来源，请检查显示器连接并重开应用。";
            return callback({});
          }
          captureDiagnostic.stage = "loopback-granted";
          callback({ video: sources[0], audio: "loopback" });
        } catch (error) {
          captureDiagnostic.error = `系统来源读取失败：${error.message}`;
          console.error("System audio source unavailable:", error.message);
          callback({});
        }
      },
      // The native picker can return video without the requested audio track.
      { useSystemPicker: false },
    );
    const trusted = (event) => {
      if (event.senderFrame?.url !== server.url + "/")
        throw new Error("This action is only available from the workbench.");
    };
    ipcMain.handle("media:status", (event) => {
      trusted(event);
      return {
        platform: process.platform,
        microphone: systemPreferences.getMediaAccessStatus("microphone"),
        screen: systemPreferences.getMediaAccessStatus("screen"),
        captureDiagnostic,
      };
    });
    ipcMain.handle("media:settings", (event, kind) => {
      trusted(event);
      const pane = {
        screen: "Privacy_ScreenCapture",
        microphone: "Privacy_Microphone",
      }[kind];
      if (pane && process.platform === "darwin")
        return shell.openExternal(
          `x-apple.systempreferences:com.apple.preference.security?${pane}`,
        );
    });
    ipcMain.handle("media:test-sound", (event) => {
      trusted(event);
      if (process.platform !== "darwin") return;
      return new Promise((resolve, reject) => {
        execFile(
          "/usr/bin/afplay",
          ["/System/Library/Sounds/Glass.aiff"],
          { timeout: 5000 },
          (error) => (error ? reject(error) : resolve()),
        );
      });
    });
    ipcMain.handle("app:restart", (event) => {
      trusted(event);
      app.relaunch();
      app.quit();
    });
    main = new BrowserWindow({
      width: 1440,
      height: 940,
      minWidth: 1050,
      minHeight: 720,
      title: "面试助手",
      backgroundColor: "#101514",
      titleBarStyle: "hiddenInset",
      webPreferences: opts,
    });
    secure(main);
    await main.loadURL(server.url);
    const cards = createCardWindows({
      BrowserWindow,
      screen,
      baseUrl: server.url,
      webPreferences: opts,
      secure,
    });
    ipcMain.handle("card:open", (event, card) => {
      trusted(event);
      return cards.open(card);
    });
    ipcMain.handle("card:pin", (event, value) =>
      cards.pin(event.sender, value),
    );
    ipcMain.handle("card:close", (event) => cards.close(event.sender));
    ipcMain.handle("card:tile", (event) => {
      if (!cards.owns(event.sender)) trusted(event);
      cards.tile();
    });
    ipcMain.handle("overlay:open", openOverlay);
    ipcMain.handle("overlay:close", () => overlay?.close());
    ipcMain.handle("overlay:pin", (_event, value) => {
      overlay?.setAlwaysOnTop(value, "floating");
      return !!overlay?.isAlwaysOnTop();
    });
    globalShortcut.register("CommandOrControl+Shift+J", () => {
      if (overlay && !overlay.isDestroyed() && overlay.isVisible())
        overlay.hide();
      else void openOverlay();
    });
    app.on("second-instance", () => {
      main?.show();
      main?.focus();
    });
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  server?.engine.close();
  server?.closeAudio();
});
