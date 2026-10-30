const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const isDevelopment = Boolean(process.env.MEALY_DEV_SERVER_URL)
const productionIndexUrl = pathToFileURL(path.join(__dirname, '../dist/renderer/index.html')).toString()

function isAllowedNavigation(url) {
  try {
    const target = new URL(url)
    const allowed = new URL(isDevelopment ? process.env.MEALY_DEV_SERVER_URL : productionIndexUrl)
    return isDevelopment
      ? target.origin === allowed.origin
      : target.protocol === 'file:' && target.pathname === allowed.pathname
  } catch {
    return false
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f7fb',
    title: 'Mealy POS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })

  if (isDevelopment) {
    window.loadURL(process.env.MEALY_DEV_SERVER_URL)
  } else {
    window.loadURL(productionIndexUrl)
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)
  ipcMain.handle('mealy:runtime-info', () => ({ platform: process.platform, online: true }))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-attach-webview', (event) => event.preventDefault())
})
