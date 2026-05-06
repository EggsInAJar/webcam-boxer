/**
 * Copies MediaPipe WASM files from node_modules to public/mediapipe/wasm/
 * and downloads the pose landmarker model if it's missing.
 *
 * Run automatically via `postinstall` or manually with `node scripts/setup-mediapipe.mjs`.
 */
import { cp, mkdir, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const WASM_SRC = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const WASM_DEST = join(root, 'public/mediapipe/wasm')
const MODEL_DEST = join(root, 'public/mediapipe/pose_landmarker_lite.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

await mkdir(WASM_DEST, { recursive: true })

await cp(WASM_SRC, WASM_DEST, { recursive: true })
console.log('Copied MediaPipe WASM files →', WASM_DEST)

try {
  await access(MODEL_DEST)
  console.log('Model already present, skipping download')
} catch {
  console.log('Downloading pose landmarker model…')
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Failed to download model: ${res.status}`)
  await pipeline(res.body, createWriteStream(MODEL_DEST))
  console.log('Downloaded pose landmarker model →', MODEL_DEST)
}
