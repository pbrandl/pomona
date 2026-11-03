/**
 * The only door between the sandboxed UI and the main process. Exposes the
 * pipe to the worker and three small OS services; nothing else.
 */
'use strict'
const { contextBridge, ipcRenderer } = require('electron')

const on = (channel, fn) => {
  const wrap = (evt, data) => fn(data)
  ipcRenderer.on(channel, wrap)
  return () => ipcRenderer.removeListener(channel, wrap)
}

contextBridge.exposeInMainWorld('bridge', {
  start: () => ipcRenderer.invoke('pomona:start'),
  write: (line) => ipcRenderer.invoke('pomona:write', String(line)),
  onData: (fn) => on('pomona:data', fn),
  onExit: (fn) => on('pomona:exit', fn),
  copy: (text) => ipcRenderer.invoke('pomona:copy', String(text)),
  cameraAccess: () => ipcRenderer.invoke('pomona:camera'),
  relaunch: () => ipcRenderer.invoke('pomona:relaunch')
})
