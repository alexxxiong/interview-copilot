// Each open request owns a separate native window; no shared overlay identity.
export function createCardWindows({
  BrowserWindow,
  screen,
  baseUrl,
  webPreferences,
  secure,
}) {
  const windows = new Set();
  const current = (sender) =>
    [...windows].find((w) => !w.isDestroyed() && w.webContents === sender);
  return {
    async open({ id, title, sessionId }) {
      if (
        typeof id !== "string" ||
        !/^[a-zA-Z0-9-]{1,100}$/.test(id) ||
        typeof sessionId !== "string" ||
        !/^[a-zA-Z0-9-]{1,100}$/.test(sessionId) ||
        typeof title !== "string" ||
        !title.trim() ||
        title.length > 6000
      )
        throw Error("卡片信息无效");
      const area = screen.getDisplayNearestPoint(
        screen.getCursorScreenPoint(),
      ).workArea;
      const width = Math.min(580, area.width),
        height = Math.min(800, area.height);
      const offset = (windows.size % 8) * 28;
      const win = new BrowserWindow({
        width,
        height,
        minWidth: 340,
        minHeight: 320,
        x: area.x + Math.min(40 + offset, area.width - width),
        y: area.y + Math.min(35 + offset, area.height - height),
        title: title + " · 问题卡片",
        backgroundColor: "#141918",
        titleBarStyle: "hiddenInset",
        webPreferences,
      });
      windows.add(win);
      win.on("closed", () => windows.delete(win));
      win.on("page-title-updated", (event) => event.preventDefault());
      secure(win);
      const url = new URL("/", baseUrl);
      url.searchParams.set("card", id);
      url.searchParams.set("session", sessionId);
      try {
        await win.loadURL(url.href);
      } catch (error) {
        win.close();
        throw error;
      }
    },
    pin(sender, value) {
      const win = current(sender);
      if (!win) throw Error("卡片窗口已关闭");
      win.setAlwaysOnTop(!!value, "floating");
      // Do not enable fullscreen overlay mode: Electron hides the app's Dock icon.
      win.setVisibleOnAllWorkspaces(!!value);
      return win.isAlwaysOnTop();
    },
    close(sender) {
      current(sender)?.close();
    },
    owns(sender) {
      return !!current(sender);
    },
    tile() {
      const all = [...windows].filter((w) => !w.isDestroyed());
      if (!all.length) return;
      const area = screen.getDisplayNearestPoint(
        screen.getCursorScreenPoint(),
      ).workArea;
      const maxCols = Math.max(1, Math.floor(area.width / 340));
      const maxRows = Math.max(1, Math.floor(area.height / 320));
      const cols = Math.min(
        all.length,
        maxCols,
        Math.ceil(Math.sqrt((all.length * area.width) / area.height)),
      );
      const rows = Math.min(maxRows, Math.ceil(all.length / cols));
      const width = Math.floor(area.width / cols),
        height = Math.floor(area.height / rows);
      all.forEach((win, i) => {
        // When there are more windows than readable cells, start another layer.
        const cell = i % (cols * rows);
        if (win.isMinimized()) win.restore();
        win.setBounds({
          x: area.x + (cell % cols) * width,
          y: area.y + Math.floor(cell / cols) * height,
          width,
          height,
        });
        win.show();
      });
    },
  };
}
