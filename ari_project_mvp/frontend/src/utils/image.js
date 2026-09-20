// 업로드 전 이미지 축소. 폰 카메라 원본(수 MB)을 그대로 올리면 느리고 용량 제한에 걸린다.
// 실패하면 원본 파일을 그대로 돌려준다 (업로드 자체는 막지 않는다).
const MAX_EDGE = 1600
const QUALITY = 0.85

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다')) }
    img.src = url
  })
}

export async function shrinkImage(file, maxEdge = MAX_EDGE, quality = QUALITY) {
  if (!file || !file.type?.startsWith('image/')) return file
  try {
    const img = await loadImage(file)
    const longest = Math.max(img.width, img.height)
    const scale = longest > maxEdge ? maxEdge / longest : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality))
    if (!blob) return file
    const name = file.name.replace(/\.[^.]+$/, '') || 'verification'
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
