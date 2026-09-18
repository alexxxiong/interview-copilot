const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  openOverlay: () => ipcRenderer.invoke("overlay:open"),
  setPinned: (value) => ipcRenderer.invoke("overlay:pin", !!value),
  closeOverlay: () => ipcRenderer.invoke("overlay:close"),
  openCard: (card) => ipcRenderer.invoke("card:open", card),
  pinCard: (value) => ipcRenderer.invoke("card:pin", !!value),
  closeCard: () => ipcRenderer.invoke("card:close"),
  tileCards: () => ipcRenderer.invoke("card:tile"),
  mediaStatus: () => ipcRenderer.invoke("media:status"),
  openMediaSettings: (kind) => ipcRenderer.invoke("media:settings", kind),
  playTestSound: () => ipcRenderer.invoke("media:test-sound"),
  restart: () => ipcRenderer.invoke("app:restart"),
});
