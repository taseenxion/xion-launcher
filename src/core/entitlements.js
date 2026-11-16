// Xion+ entitlements.
//
// Xion+ now lives on the player's Xion account: buying it on the shop adds "xion_plus" to the
// account's owned list, and signing in anywhere unlocks it. Legacy Ed25519 license keys still
// verify, so everyone who bought before accounts existed keeps everything they paid for.
const license = require('./license')

const PLUS_ID = 'xion_plus'

/** True when the signed-in Xion account owns Xion+. */
const ownsPlus = settings => {
  const x = settings && settings.xion
  return !!(x && Array.isArray(x.owned) && x.owned.includes(PLUS_ID))
}

/** True when this install has Xion+: account entitlement or a valid legacy key. */
const premium = settings => !!(settings && (ownsPlus(settings) || license.verify(settings.licenseKey).valid))

/** Name shown as the Xion+ owner: legacy key name first, then the account's display name. */
const name = settings => {
  const key = license.verify(settings && settings.licenseKey)
  if (key.valid && key.name) return key.name
  const x = (settings && settings.xion) || {}
  return x.name || x.ign || x.email || ''
}

/** Whether a legacy license key is what unlocked this install. */
const hasKey = settings => !!(settings && license.verify(settings.licenseKey).valid)

module.exports = { premium, ownsPlus, name, hasKey, PLUS_ID }
