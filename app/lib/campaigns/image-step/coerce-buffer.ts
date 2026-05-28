export type WorkflowImageBufferInput =
  | Buffer
  | {
      buffer?: Buffer
    }

/** Normalize download output / legacy callers into a non-empty Buffer. */
export function coerceWorkflowImageBuffer(input: WorkflowImageBufferInput): Buffer {
  if (Buffer.isBuffer(input)) {
    if (!input.length) {
      throw new Error('Background image file is empty')
    }
    return input
  }

  const buf = input.buffer
  if (Buffer.isBuffer(buf) && buf.length > 0) {
    return buf
  }

  throw new Error('Background image is missing (upload it again in the workflow editor)')
}
