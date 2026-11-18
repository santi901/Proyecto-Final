// Tipo de una imagen por sus primeros bytes ("magic bytes"), no por lo que diga el
// cliente en el Content-Type, que se puede falsificar. Devuelve 'image/jpeg',
// 'image/png' o null. Lo usan la verificación de identidad y las disputas (Sprint 6).
function tipoPorContenido(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x89504e47) return 'image/png'
  return null
}

module.exports = { tipoPorContenido }
