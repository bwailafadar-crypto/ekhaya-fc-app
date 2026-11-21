const DEFAULT_MAX_IMAGE_BYTES = 180 * 1024
const DEFAULT_MAX_IMAGE_DIMENSION = 720

type CompressOptions = { maxBytes?: number; maxDimension?: number; keepTransparency?: boolean }

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('This image could not be opened. Choose another image.'))
    }
    image.src = objectUrl
  })
}

function imageDataSize(dataUrl: string) {
  const encoded = dataUrl.split(',')[1] ?? ''
  return Math.floor(encoded.length * 3 / 4)
}

/** Sizes that keep fans' data use low (they download these on every visit). */
export const IMAGE_SIZES = {
  // Team crests: shown at 30–84 px, keep transparent edges.
  logo: { maxDimension: 192, maxBytes: 20 * 1024, keepTransparency: true },
  // Player photos: shown at 30–120 px (share cards up to ~460 px).
  player: { maxDimension: 360, maxBytes: 32 * 1024 },
  // Hero/banner photos: full-width backdrop on Home and the match page.
  hero: { maxDimension: 1280, maxBytes: 240 * 1024 },
} satisfies Record<string, CompressOptions>

function fromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('This stored image could not be opened.'))
    image.src = dataUrl
  })
}

function encode(image: HTMLImageElement, options: CompressOptions) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_IMAGE_DIMENSION
  let scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  for (let resizeAttempt = 0; resizeAttempt < 8; resizeAttempt += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image compression is not available on this device.')
    if (!options.keepTransparency) {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    if (options.keepTransparency) {
      // WebP keeps see-through edges and is small; browsers that cannot make WebP give PNG.
      for (let quality = 0.9; quality >= 0.4; quality -= 0.1) {
        const webp = canvas.toDataURL('image/webp', quality)
        if (webp.startsWith('data:image/webp') && imageDataSize(webp) <= maxBytes) return webp
      }
      const png = canvas.toDataURL('image/png')
      if (imageDataSize(png) <= maxBytes) return png
    } else {
      for (let quality = 0.88; quality >= 0.2; quality -= 0.08) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality)
        if (imageDataSize(dataUrl) <= maxBytes) return dataUrl
      }
    }
    scale *= 0.8
  }
  throw new Error('This image is too large to store. Choose a smaller image.')
}

/** Re-saves an image that is already stored, at a smaller size. */
export async function shrinkDataUrl(dataUrl: string, options: CompressOptions) {
  return encode(await fromDataUrl(dataUrl), options)
}

export function dataUrlBytes(dataUrl: string | null | undefined) {
  return dataUrl ? imageDataSize(dataUrl) : 0
}

export async function compressImage(file: File, options: CompressOptions = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  return encode(await loadImage(file), options)
}
