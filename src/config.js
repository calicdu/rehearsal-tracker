/**
 * Band Rehearsal Tracker - Cloud Sync Configuration
 *
 * How to get your free Firebase database URL (2 minutes, 100% free forever):
 * 1. Go to https://console.firebase.google.com and click "Add project".
 * 2. In your project menu, click "Build" ➔ "Realtime Database" ➔ "Create Database".
 * 3. Choose "Start in test mode" (rules: { ".read": true, ".write": true }).
 * 4. Copy your database URL (e.g. "https://your-band-default-rtdb.firebaseio.com") and paste it below:
 */
const CLOUD_CONFIG = {
  firebaseDbUrl: "", // Paste your Firebase Database URL here
  autoSync: true
};
