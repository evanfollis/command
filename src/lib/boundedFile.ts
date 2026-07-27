import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
} from 'node:fs'

export interface BoundedUtf8File {
  text: string
  size: number
  mtimeMs: number
}

export function readBoundedUtf8File(
  file: string,
  maxBytes: number,
): BoundedUtf8File {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError('maxBytes must be a positive safe integer')
  }
  const fd = openSync(
    /*turbopackIgnore: true*/ file,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  )
  try {
    const initial = fstatSync(fd)
    if (!initial.isFile()) throw new Error('source is not a regular file')
    if (initial.size > maxBytes) throw new Error(`source exceeds ${maxBytes} bytes`)
    const buffer = Buffer.alloc(maxBytes + 1)
    let offset = 0
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null)
      if (count === 0) break
      offset += count
    }
    if (offset > maxBytes) throw new Error(`source grew beyond ${maxBytes} bytes`)
    return {
      text: buffer.subarray(0, offset).toString('utf8'),
      size: offset,
      mtimeMs: initial.mtimeMs,
    }
  } finally {
    closeSync(fd)
  }
}
