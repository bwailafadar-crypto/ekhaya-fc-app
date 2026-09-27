const MAX_IMAGE_BYTES = 180 * 1024
const MAX_IMAGE_DIMENSION = 720

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

export async function compressImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  const image = await loadImage(file)
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Image compression is not available on this device.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  for (let quality = 0.88; quality >= 0.35; quality -= 0.08) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (imageDataSize(dataUrl) <= MAX_IMAGE_BYTES) return dataUrl
  }

  throw new Error('This image is too large to store. Choose a smaller image.')
}