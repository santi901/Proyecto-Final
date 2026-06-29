const bcrypt = require('bcryptjs')

function generarPin() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function hashearPin(pin) {
  return bcrypt.hash(pin, 10)
}

async function validarPin(pin, hash) {
  return bcrypt.compare(pin, hash)
}

module.exports = { generarPin, hashearPin, validarPin }
