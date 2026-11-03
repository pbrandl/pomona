/**
 * Electron main process: the window, and the broker between the sandboxed UI
 * and the Bare worker (worker/index.js) that pear-runtime starts. It holds no
 * keys and runs no app logic; the worker does. Based on holepunchto/hello-pear-electron.
 *
 *   npm start                            local dev chain (contracts: npm run chain)
 *   npm start -- --storage <dir>         a further instance with its own wallet
 *
 * P2P updates (pear-runtime updater) come with packaging and a release link.
 */
'use strict'
const { app, BrowserWindow, ipcMain, clipboard, shell, session, systemPreferences, nativeTheme } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { StringDecoder } = require('string_decoder')
const PearRuntime = require('pear-runtime')

const argv = process.argv.slice(app.isPackaged ? 1 : 2)
const option = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] ?? null }
const dev = argv.includes('--dev')
const storage = option('--storage')
// Own storage, own instance: the single-instance lock lives in userData.
if (storage) app.setPath('userData', path.resolve(storage))

const UI = path.join(__dirname, '..', 'index.html')
const UI_URL = pathToFileURL(UI).href
const WORKER = path.join(__dirname, '..', 'worker', 'index.js')

// ------------------------------------------------------------------ worker

let worker = null

function startWorker () {
  if (worker) return
  // Wallets of the local dev chain and of real networks never mix.
  const dir = path.join(app.getPath('userData'), dev ? 'dev' : 'storage')
  worker = PearRuntime.run(WORKER, [JSON.stringify({ storage: dir, dev })])
  const decoder = new StringDecoder('utf8')
  worker.on('data', (chunk) => {
    const text = decoder.write(chunk)
    if (text) send('pomona:data', text)
  })
  worker.stdout?.on('data', (d) => process.stdout.write('[worker] ' + d))
  worker.stderr?.on('data', (d) => process.stderr.write('[worker] ' + d))
  worker.on('error', (err) => console.error('[worker]', err))
  worker.once('exit', (code) => {
    worker = null
    send('pomona:exit', code)
  })
}

function send (channel, data) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
}

/** IPC only from our own page, never from anything else loaded in a frame. */
const trusted = (evt) => evt.senderFrame?.url?.startsWith(UI_URL) === true

ipcMain.handle('pomona:start', (evt) => {
  if (!trusted(evt)) return false
  startWorker()
  return true
})
ipcMain.handle('pomona:write', (evt, line) => {
  if (!trusted(evt) || !worker || typeof line !== 'string' || line.length > 1_000_000) return false
  worker.write(line)
  return true
})
ipcMain.handle('pomona:copy', (evt, text) => {
  if (trusted(evt)) clipboard.writeText(String(text).slice(0, 10_000))
})
ipcMain.handle('pomona:camera', async (evt) => {
  if (!trusted(evt)) return false
  // macOS asks the person once; elsewhere the browser permission is enough.
  return process.platform === 'darwin' ? systemPreferences.askForMediaAccess('camera') : true
})
ipcMain.handle('pomona:relaunch', (evt) => {
  if (!trusted(evt)) return
  app.relaunch()
  app.quit()
})

// ------------------------------------------------------------------ window

function createWindow () {
  const win = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    title: 'Pomona',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121311' : '#F7F6F2',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.once('ready-to-show', () => win.show())
  // Only our own page: no navigation away; web links (the project's website)
  // open in the default browser.
  win.webContents.on('will-navigate', (evt) => evt.preventDefault())
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.loadFile(UI)
  return win
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  app.whenReady().then(() => {
    // The camera for scanning QR codes; nothing else.
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
      callback(permission === 'media' && (details.mediaTypes ?? []).every((t) => t === 'video'))
    })
    session.defaultSession.setPermissionCheckHandler((wc, permission) => permission === 'media')
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  // SIGTERM: the worker closes swarm and storage cleanly (graceful-goodbye).
  app.on('before-quit', () => worker?.destroy())
}
