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
    const buffer = Buffer.alloc(initial.size + 1)
    let offset = 0
    while (offset < buffer.length) {
      const count = readSync(fd, buffer, offset, buffer.length - offset, null)
      if (count === 0) break
      offset += count
    }
    const final = fstatSync(fd)
    if (
      offset !== initial.size
      || final.size !== initial.size
      || final.mtimeMs !== initial.mtimeMs
    ) {
      throw new Error('source changed during bounded read')
    }
    return {
      text: buffer.subarray(0, offset).toString('utf8'),
      size: offset,
      mtimeMs: initial.mtimeMs,
    }
  } finally {
    closeSync(fd)
  }
}

export function readBoundedUtf8Tail(
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
    const truncated = initial.size > maxBytes
    const length = truncated ? maxBytes + 1 : initial.size
    const position = truncated ? initial.size - maxBytes - 1 : 0
    const buffer = Buffer.alloc(length)
    let offset = 0
    while (offset < length) {
      const count = readSync(
        fd,
        buffer,
        offset,
        length - offset,
        position + offset,
      )
      if (count === 0) break
      offset += count
    }
    let text = buffer.subarray(0, offset).toString('utf8')
    if (truncated) {
      if (buffer[0] === 0x0a) text = text.slice(1)
      else {
        const firstNewline = text.indexOf('\n')
        text = firstNewline === -1 ? '' : text.slice(firstNewline + 1)
      }
    }
    return {
      text,
      size: initial.size,
      mtimeMs: initial.mtimeMs,
    }
  } finally {
    closeSync(fd)
  }
}
