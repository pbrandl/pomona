/**
 * Camera QR scanner for receipts. getUserMedia + jsQR (ui/vendor/jsqr.js).
 *
 * The <video> element lives outside the render cycle (app.js replaces the DOM
 * on every render) and is re-attached into #scanner-slot after each render.
 *
 * @module ui/scanner
 */

/**
 * Decodes a QR code from RGBA pixels.
 * @param {ImageData} img
 * @returns {string|null}
 */
export function decode (img) {
  const r = window.jsQR?.(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
  return r?.data ?? null
}

export class Scanner {
  /**
   * @param {(code: string) => void} onCode - called once with the first matching code
   * @param {(code: string) => boolean} [accept] - which codes to accept
   */
  constructor (onCode, accept = (c) => c.startsWith('pomona-beleg://')) {
    this.onCode = onCode
    this.accept = accept
    this.video = null
    this.stream = null
    this.canvas = document.createElement('canvas')
    this.active = false
    this.last = 0
  }

  async start () {
    if (window.pomona.cameraAccess && !(await window.pomona.cameraAccess())) {
      throw new Error('Pomona hat keinen Zugriff auf die Kamera. Du kannst den Code auch einfügen.')
    }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Keine Kamera verfügbar. Du kannst den Code einfügen.')
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
    } catch {
      throw new Error('Kamera nicht verfügbar. Du kannst den Code einfügen.')
    }
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    this.video.srcObject = this.stream
    this.active = true
    this.attach()
    await this.video.play().catch(() => {})
    this._tick()
  }

  /** Puts the video back into the freshly rendered sheet. */
  attach () {
    const slot = document.getElementById('scanner-slot')
    if (!this.active || !slot || this.video.parentNode === slot) return
    slot.appendChild(this.video)
    this.video.play().catch(() => {})
  }

  stop () {
    this.active = false
    for (const t of this.stream?.getTracks() ?? []) t.stop()
    this.video?.remove()
    this.stream = null
    this.video = null
  }

  /** @private */
  _tick () {
    if (!this.active) return
    window.requestAnimationFrame(() => this._tick())
    const now = performance.now()
    if (now - this.last < 150 || this.video.readyState < 2) return
    this.last = now
    const w = this.video.videoWidth
    const h = this.video.videoHeight
    if (!w || !h) return
    this.canvas.width = w
    this.canvas.height = h
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(this.video, 0, 0, w, h)
    const code = decode(ctx.getImageData(0, 0, w, h))
    if (code && this.accept(code)) {
      this.stop()
      this.onCode(code)
    }
  }
}
