// Extends app.json. EAS builds get google-services.json (Android push) from the GOOGLE_SERVICES_JSON file variable,
// so the Firebase config never sits in the public repo; locally it is read from mobile/google-services.json if present.
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? './google-services.json' : undefined);
  return googleServicesFile ? { ...config, android: { ...config.android, googleServicesFile } } : config;
};
