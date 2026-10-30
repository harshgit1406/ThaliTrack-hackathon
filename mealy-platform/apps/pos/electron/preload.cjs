const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mealyDesktop', {
  getRuntimeInfo: () => ipcRenderer.invoke('mealy:runtime-info'),
})
