const jwt = require('jsonwebtoken')

const ACCESS_SECRET   = process.env.JWT_SECRET
const REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET
const ACCESS_EXPIRES  = process.env.JWT_EXPIRES_IN        || '15m'
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d'

function generarAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES })
}

function generarRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES })
}

function verificarAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET)
}

function verificarRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET)
}

module.exports = {
  generarAccessToken,
  generarRefreshToken,
  verificarAccessToken,
  verificarRefreshToken,
}
