const KEY = 'cameraId'

export const savedCameraId = (): string | undefined => {
  try { return localStorage.getItem(KEY) ?? undefined } catch { return undefined }
}
export const saveCameraId = (id: string) => {
  try { localStorage.setItem(KEY, id) } catch { /* egal */ }
}

const REAR = /back|rear|rück|environment|hinten/i
const NOT_MAIN = /wide|ultra|weitwinkel|0[.,]5|tele|macro|makro|depth|tiefe/i

/** Rückkameras; sind keine als solche beschriftet, alle Kameras. */
export function rearCameras(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  const cams = devices.filter((d) => d.kind === 'videoinput')
  const rear = cams.filter((d) => REAR.test(d.label))
  return rear.length ? rear : cams
}

/**
 * Wählt die Hauptkamera: gespeicherte Wahl → Android „camera 0“/„camera2 0“
 * → erste Rückkamera ohne Weitwinkel/Tele im Namen → erste Rückkamera.
 */
export function pickMainCamera(devices: MediaDeviceInfo[], saved?: string): MediaDeviceInfo | undefined {
  const rear = rearCameras(devices)
  return (
    rear.find((d) => d.deviceId === saved) ??
    rear.find((d) => /camera2? 0\b/i.test(d.label)) ??
    rear.find((d) => !NOT_MAIN.test(d.label)) ??
    rear[0]
  )
}
