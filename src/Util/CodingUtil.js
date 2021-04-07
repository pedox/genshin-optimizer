/// Schema keys
/// Common {
///   encode?: A function that transform encoding object into the specified format
///   decode?: A function that transform object in the specified format into the decoded object
/// }
///
/// UInt: { type: "uint",
///   length?: number of bytes, uses variable-length format if not set,
/// }
/// String: { type: "string" }
/// Array: { type: "array",
///   schemas?: Array of schemas, in the same order as the item,
///   defaultSchema?: Default schema for when `schemas[i]` is `null`,
/// }
/// Object: { type: "object",
///   schemas: A key-schema dictionary. All keys are encoded {
///     default: default value if the object[key] doesn't exist
///   }
/// }
/// Sparse: { type: "sparse",
///   keys?: A list of permitted keys, `null` if all keys are permitted,
///   keySchema: Common schema for keys,
///   valueSchema: Common schema for values,
/// }

export function encode(data, schema) {
  return encodeItem(data, schema, null)
}
export function decode(string, schema) {
  const stream = new BlockStream(string)
  const result = decodeItem(stream, schema, null)
  stream.end()
  return result
}

function encodeItem(data, schema, pathItem) {
  try {
    if (schema.encode)
      data = schema.encode(data)
    switch (schema.type) {
      case "uint": return encodeUInt(data, schema)
      case "string": return encodeString(data, schema)
      case "array": return encodeArray(data, schema)
      case "object": return encodeObject(data, schema)
      case "sparse": return encodeSparse(data, schema)
      default: throw new Error(`Unsupported schema type ${schema.type} on array`)
    }
  } catch (error) {
    error.path = error.path ?? []
    error.path.push(pathItem)
    throw error
  }
}
function decodeItem(stream, schema, pathItem) {
  try {
    let result
    switch (schema.type) {
      case "uint": result = decodeUInt(stream, schema); break
      case "string": result = decodeString(stream, schema); break
      case "array": result = decodeArray(stream, schema); break
      case "object": result = decodeObject(stream, schema); break
      case "sparse": result = decodeSparse(stream, schema); break
      default: throw new Error(`Unsupported schema type ${schema.type} on array`)
    }
    if (schema.decode)
      return schema.decode(result)
    return result
  } catch (error) {
    error.path = error.path ?? []
    error.path.push(pathItem)
    throw error
  }
}

function encodeSparse(data, schema) {
  const { keySchema, keys, valueSchema } = schema
  const items = Object.entries(data).filter(([key]) => keys?.includes(key) ?? true)

  return encodeLength(items.length) + items.map(([key, value]) =>
    encodeItem(key, keySchema, key) + encodeItem(value, valueSchema, key)
  ).join('')
}
function decodeSparse(stream, schema) {
  const { keys, keySchema, valueSchema } = schema
  const length = decodeLength(stream)

  return Object.fromEntries([...new Array(length)].map(() => {
    const key = decodeItem(stream, keySchema, null)
    const value = decodeItem(stream, valueSchema, key)
    return [key, value]
  }).filter(([key]) => keys?.includes(key) ?? true))
}

function encodeObject(data, schema) {
  const { schemas = [] } = schema
  return Object.entries(schemas).map(([key, schema]) =>
    encodeItem(key in data ? data[key] : schema.default, schema, key)
  ).join('')
}
function decodeObject(stream, schema) {
  const { schemas = [] } = schema
  return Object.fromEntries(Object.entries(schemas).map(([key, schema]) =>
    [key, decodeItem(stream, schema, key)]
  ))
}

function encodeArray(data, schema) {
  const { schemas = [], defaultSchema } = schema
  return encodeLength(data.length) + data.map((item, i) =>
    encodeItem(item, schemas[i] ?? defaultSchema, i)
  ).join('')
}
function decodeArray(stream, schema) {
  const { schemas = [], defaultSchema } = schema, length = decodeLength(stream)
  return [...new Array(length)].map((unused, i) =>
    decodeItem(stream, schemas[i] ?? defaultSchema, i))
}

function encodeString(string, schema) {
  if (!string.match(/^[a-z0-9\-_]+$/i))
    throw new Error(`Cannot encode string ${string}: not alphanumeric or -_`)
  return encodeLength(string.length) + string
}
function decodeString(stream, schema) {
  const string = stream.take(decodeLength(stream))
  if (!string.match(/^[a-z0-9\-_]+$/i))
    throw new Error(`Cannot decode string ${string}: not alphanumeric or -_`)
  return string
}

function encodeUInt(uint, schema) {
  const string = uintToString(uint, schema.length)
  return schema.length ? string : (encodeLength(string.length) + string)
}
function decodeUInt(stream, schema) {
  let length = schema.length || decodeLength(stream)
  return stringToUInt(stream.take(length))
}

// Keep the length low. We might want to reserve high bits for later extension.
function encodeLength(length) {
  if (length >= 32)
    throw new Error(`Length (${length}) too large`)
  return uintToString(length, 1)
}
function decodeLength(stream) {
  let length = stringToUInt(stream.take(1))
  if (length >= 32)
    throw new Error(`Length (${length}) too large`)
  return length
}

function uintToString(number, length = 0) {
  if (number < 0) throw new Error(`Cannot encode negative number ${number}`)

  var string = ""
  while (number > 0) {
    string += uintToChar(number % 64)
    number = Math.floor(number / 64)
  }

  if (!length)
    return string

  if (string.length > length)
    throw new Error(`Cannot encode uint ${number}: value too large`)
  return string.padEnd(length, "0")
}
function stringToUInt(string) {
  let result = 0, multiplier = 1

  for (let i = 0; i < string.length; i++) {
    result += multiplier * charToUInt(string, i)
    multiplier *= 64
  }

  return result
}

function uintToChar(number) {
  if (number < 10) return String.fromCharCode(number + 48 - 0) // 0-9
  if (number < 36) return String.fromCharCode(number + 97 - 10) // a-z
  if (number < 62) return String.fromCharCode(number + 65 - 36) // A-Z
  if (number === 62) return "-"
  if (number === 63) return "_"
  throw new Error(`Cannot convert ${number} to char`)
}
function charToUInt(string, index) {
  const code = string.charCodeAt(index)
  if (48 <= code && code < 58) return code - 48 + 0 // 0-9
  if (97 <= code && code < 123) return code - 97 + 10 // a-z
  if (65 <= code && code < 91) return code - 65 + 36 // A-Z
  if (string[index] === '-') return 62
  if (string[index] === '_') return 63
  throw new Error(`Cannot convert "${string[index]}" in "${string}" to uint`)
}

class BlockStream {
  constructor(string) {
    this.string = string
    this.offset = 0
  }
  take(count) {
    if (this.offset + count > this.string.length)
      throw new Error(`Cannot take ${count} items from ${this.string.slice(this.offset)}`)

    const result = this.string.slice(this.offset, this.offset + count)
    this.offset += count
    return result
  }
  end() {
    if (this.string.length !== this.offset)
      throw new Error(`Unused string ${this.string.slice(this.offset)}`)
  }
}
