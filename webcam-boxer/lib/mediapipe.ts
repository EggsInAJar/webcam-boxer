import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type { NormalizedLandmark }

// Prefer self-hosted assets (copied by scripts/setup-mediapipe.mjs).
// Falls back to CDN if the local path is unavailable (e.g. dev without postinstall).
const WASM_URL = '/mediapipe/wasm'
const MODEL_URL = '/mediapipe/pose_landmarker_lite.task'
const CDN_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const CDN_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

export const LM = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const

let instance: PoseLandmarker | null = null
let promise: Promise<PoseLandmarker> | null = null

async function createLandmarker(wasmUrl: string, modelUrl: string): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(wasmUrl)
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
}

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (instance) return instance
  if (promise) return promise

  promise = (async () => {
    try {
      instance = await createLandmarker(WASM_URL, MODEL_URL)
    } catch {
      // Local assets unavailable — fall back to CDN
      instance = await createLandmarker(CDN_WASM_URL, CDN_MODEL_URL)
    }
    return instance!
  })()

  return promise
}
