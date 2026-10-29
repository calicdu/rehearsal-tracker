/**
 * Band Rehearsal Tracker - Application Configuration & Defaults
 */
const FIREBASE_DB_URL = "https://rehearsal-tracker-cc229-default-rtdb.europe-west1.firebasedatabase.app";

const DEFAULT_BAND_NAME = "Our Band";

const DEFAULT_MEMBERS = Object.freeze([
  Object.freeze({ id: "1", name: "Alex", role: "Guitar / Vocals" }),
  Object.freeze({ id: "2", name: "Sam", role: "Bass" }),
  Object.freeze({ id: "3", name: "Jordan", role: "Drums" }),
  Object.freeze({ id: "4", name: "Taylor", role: "Keys / Synths" })
]);

const MAX_HISTORY_ITEMS = 50;

const STORAGE_KEYS = Object.freeze({
  QUEUE: "band_pay_queue",
  HISTORY: "band_pay_history",
  BAND_NAME: "band_pay_name",
  SOUND: "band_pay_sound",
  UPDATED_AT: "band_pay_updated_at",
  PENDING_SYNC: "band_pay_pending_sync"
});
