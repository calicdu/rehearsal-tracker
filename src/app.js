/**
 * Band Rehearsal Pay Tracker - Core Application
 * Zero-dependency, offline-ready, responsive client-side app.
 */

// Default starter roster
const DEFAULT_MEMBERS = [
  { id: '1', name: 'Alex', role: 'Guitar / Vocals' },
  { id: '2', name: 'Sam', role: 'Bass' },
  { id: '3', name: 'Jordan', role: 'Drums' },
  { id: '4', name: 'Taylor', role: 'Keys / Synths' }
];

const DEFAULT_BAND_NAME = 'Our Band';

// Application State
const state = {
  bandName: DEFAULT_BAND_NAME,
  queue: [...DEFAULT_MEMBERS],
  history: [],
  soundEnabled: true,
  undoStack: [],
  isRosterModalOpen: false,
  isShareModalOpen: false,
  isStatsModalOpen: false,
  pendingSyncData: null
};

// Web Audio API Context (reusable singleton)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Pleasant melodic sound effect when rotating queue.
 */
function playPaymentChime() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Play a happy 3-note ascending arpeggio (C5, E5, G5, C6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

/**
 * Subtle descending sound for undo.
 */
function playUndoChime() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [659.25, 523.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.15, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.1 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.2);
    });
  } catch (e) {}
}

/**
 * Storage Helpers
 */
function loadState() {
  try {
    const savedQueue = localStorage.getItem('band_pay_queue');
    if (savedQueue) {
      const parsed = JSON.parse(savedQueue);
      if (Array.isArray(parsed) && parsed.length > 0) state.queue = parsed;
    }

    const savedHistory = localStorage.getItem('band_pay_history');
    if (savedHistory) {
      const parsed = JSON.parse(savedHistory);
      if (Array.isArray(parsed)) state.history = parsed;
    }

    const savedBandName = localStorage.getItem('band_pay_name');
    if (savedBandName) state.bandName = savedBandName;

    const savedSound = localStorage.getItem('band_pay_sound');
    if (savedSound !== null) state.soundEnabled = savedSound === 'true';
  } catch (e) {
    console.error('Failed to load state from localStorage:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem('band_pay_queue', JSON.stringify(state.queue));
    localStorage.setItem('band_pay_history', JSON.stringify(state.history));
    localStorage.setItem('band_pay_name', state.bandName);
    localStorage.setItem('band_pay_sound', String(state.soundEnabled));
  } catch (e) {
    console.error('Failed to save state to localStorage:', e);
  }
}

/**
 * Toast Notifications
 */
let toastTimeout = null;
function showToast(message, actionText = null, onAction = null, duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  if (toastTimeout) clearTimeout(toastTimeout);

  container.innerHTML = `
    <div class="glass-panel px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-indigo-500/30 animate-toast text-sm">
      <span class="text-indigo-400">${icon('info', 'w-5 h-5')}</span>
      <span class="text-slate-100 font-medium">${message}</span>
      ${actionText ? `
        <button id="toast-action-btn" class="ml-2 px-2.5 py-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
          ${actionText}
        </button>
      ` : ''}
    </div>
  `;

  if (actionText && onAction) {
    const btn = document.getElementById('toast-action-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        onAction();
        container.innerHTML = '';
      });
    }
  }

  toastTimeout = setTimeout(() => {
    container.innerHTML = '';
  }, duration);
}

/**
 * Date Formatter
 */
function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch (e) {
    return isoString;
  }
}

/**
 * Core Domain Actions
 */
function advanceQueue(customNote = '') {
  if (state.queue.length === 0) return;

  // Save snapshot for Undo
  state.undoStack.push({
    queue: JSON.parse(JSON.stringify(state.queue)),
    history: JSON.parse(JSON.stringify(state.history))
  });

  const currentPayer = state.queue[0];
  const nextQueue = [...state.queue.slice(1), currentPayer];

  const newHistoryEntry = {
    id: 'pay_' + Date.now().toString(),
    payerId: currentPayer.id,
    payerName: currentPayer.name,
    payerRole: currentPayer.role || '',
    timestamp: new Date().toISOString(),
    note: customNote.trim() ? customNote.trim() : null
  };

  state.queue = nextQueue;
  state.history.unshift(newHistoryEntry);
  saveState();

  playPaymentChime();

  const nextPayerName = state.queue[0]?.name || 'Next member';
  showToast(
    `Logged payment for ${currentPayer.name}! Next up: ${nextPayerName}`,
    'Undo',
    undoLastAction,
    6000
  );

  render();
}

function undoLastAction() {
  if (state.undoStack.length === 0) {
    showToast('Nothing to undo.');
    return;
  }

  const snapshot = state.undoStack.pop();
  state.queue = snapshot.queue;
  state.history = snapshot.history;
  saveState();

  playUndoChime();
  showToast('Rehearsal rotation reverted to previous state.');
  render();
}

function skipTurn() {
  if (state.queue.length < 2) return;

  // Move #1 to #2 so next person pays this time, or push #1 to the end
  const current = state.queue[0];
  const next = state.queue[1];
  const rest = state.queue.slice(2);

  state.undoStack.push({
    queue: JSON.parse(JSON.stringify(state.queue)),
    history: JSON.parse(JSON.stringify(state.history))
  });

  state.queue = [next, current, ...rest];
  saveState();

  showToast(`Swapped order: ${next.name} is now paying next; ${current.name} moved to #2.`);
  render();
}

function clearHistory() {
  if (state.history.length === 0) return;
  if (window.confirm('Are you sure you want to clear all payment history? This cannot be undone.')) {
    state.undoStack.push({
      queue: JSON.parse(JSON.stringify(state.queue)),
      history: JSON.parse(JSON.stringify(state.history))
    });
    state.history = [];
    saveState();
    showToast('Payment history cleared.', 'Undo', undoLastAction);
    render();
  }
}

function deleteHistoryEntry(id) {
  const entry = state.history.find(h => h.id === id);
  if (!entry) return;

  if (window.confirm(`Delete payment record for ${entry.payerName}?`)) {
    state.undoStack.push({
      queue: JSON.parse(JSON.stringify(state.queue)),
      history: JSON.parse(JSON.stringify(state.history))
    });
    state.history = state.history.filter(h => h.id !== id);
    saveState();
    showToast('Record deleted.', 'Undo', undoLastAction);
    render();
  }
}

/**
 * Sync Link Generation and Parsing
 */
function createSyncPayload() {
  const payload = {
    bandName: state.bandName,
    queue: state.queue,
    history: state.history.slice(0, 30), // keep recent 30 entries for URL efficiency
    v: 1,
    ts: Date.now()
  };
  return encodeURIComponent(btoa(encodeURIComponent(JSON.stringify(payload))));
}

function getSyncUrl() {
  const cleanUrl = window.location.origin + window.location.pathname;
  return `${cleanUrl}#sync=${createSyncPayload()}`;
}

function checkIncomingSync() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('#sync=')) return;

  try {
    const rawPayload = hash.split('#sync=')[1];
    if (!rawPayload) return;
    const jsonStr = decodeURIComponent(atob(decodeURIComponent(rawPayload)));
    const data = JSON.parse(jsonStr);

    if (data && Array.isArray(data.queue) && data.queue.length > 0) {
      state.pendingSyncData = data;
    }
  } catch (e) {
    console.error('Failed to parse sync data from URL hash:', e);
  }
}

function applyIncomingSync() {
  if (!state.pendingSyncData) return;

  state.undoStack.push({
    queue: JSON.parse(JSON.stringify(state.queue)),
    history: JSON.parse(JSON.stringify(state.history))
  });

  state.queue = state.pendingSyncData.queue;
  if (state.pendingSyncData.bandName) state.bandName = state.pendingSyncData.bandName;
  if (Array.isArray(state.pendingSyncData.history)) state.history = state.pendingSyncData.history;

  state.pendingSyncData = null;
  saveState();

  // Clean URL hash without reloading
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  showToast('Queue synced successfully with band link!', 'Undo', undoLastAction);
  render();
}

function dismissIncomingSync() {
  state.pendingSyncData = null;
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }
  render();
}

/**
 * Share via Native Share API or Clipboard
 */
async function shareBandUpdate() {
  const currentPayer = state.queue[0]?.name || 'Someone';
  const nextPayer = state.queue[1]?.name || 'Someone';
  const url = getSyncUrl();
  const title = `${state.bandName} - Rehearsal Pay Tracker`;
  const text = `🎵 Rehearsal update for ${state.bandName}: ${currentPayer} is up to pay next rehearsal! (Followed by ${nextPayer}). Click link to sync your tracker:`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Native share failed, copying link instead:', err);
      } else {
        return;
      }
    }
  }

  // Fallback to clipboard
  try {
    await navigator.clipboard.writeText(url);
    showToast('Sync link copied to clipboard! Paste it in your band chat.');
  } catch (e) {
    prompt('Copy this sync link to send to your band:', url);
  }
}

/**
 * Statistics calculations
 */
function getMemberStats() {
  const counts = {};
  state.queue.forEach(m => { counts[m.name] = 0; });
  state.history.forEach(h => {
    counts[h.payerName] = (counts[h.payerName] || 0) + 1;
  });
  return counts;
}

/**
 * DOM Rendering
 */
function render() {
  const app = document.getElementById('root');
  if (!app) return;

  const currentPayer = state.queue[0] || { name: 'No Members', role: 'Add members in roster' };
  const nextPayer = state.queue[1] || (state.queue[0] ? { name: state.queue[0].name, role: '(Only 1 member)' } : { name: 'None', role: '-' });
  const hasUndo = state.undoStack.length > 0;

  app.innerHTML = `
    <!-- Header -->
    <header class="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
      <div class="max-w-4xl mx-auto px-4 py-3.5 flex justify-between items-center gap-3">
        <div class="flex items-center space-x-3 min-w-0">
          <div class="p-2.5 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30 flex-shrink-0">
            ${icon('guitar', 'w-6 h-6')}
          </div>
          <div class="min-w-0">
            <h1 class="font-extrabold text-lg leading-tight text-white flex items-center gap-2 truncate">
              <span>${escapeHtml(state.bandName)}</span>
            </h1>
            <p class="text-xs text-slate-400 flex items-center gap-1.5">
              <span>Rehearsal Pay Tracker</span>
              <span class="text-slate-600">•</span>
              <span class="text-indigo-400">${state.queue.length} in rotation</span>
            </p>
          </div>
        </div>

        <!-- Header Actions -->
        <div class="flex items-center space-x-1.5 sm:space-x-2 flex-shrink-0">
          <button 
            id="btn-sound-toggle"
            title="${state.soundEnabled ? 'Mute Sounds' : 'Enable Sounds'}"
            class="p-2 text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors btn-press"
          >
            ${icon(state.soundEnabled ? 'volume2' : 'volumeX', 'w-5 h-5')}
          </button>

          <button 
            id="btn-stats-open"
            title="View Payment Stats"
            class="p-2 text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors btn-press hidden sm:block"
          >
            ${icon('barChart', 'w-5 h-5')}
          </button>

          <button 
            id="btn-share-open"
            title="Share & Sync with Band"
            class="flex items-center space-x-1.5 text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-3 py-2 rounded-xl transition-colors btn-press"
          >
            ${icon('share2', 'w-4 h-4')}
            <span class="hidden sm:inline">Sync Link</span>
          </button>

          <button 
            id="btn-roster-open"
            class="flex items-center space-x-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl border border-slate-700 transition-colors btn-press"
          >
            ${icon('users', 'w-4 h-4')}
            <span>Roster</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-4xl mx-auto px-4 py-6 sm:py-8 w-full flex-grow space-y-6 sm:space-y-8">

      <!-- Incoming Sync Banner if URL hash detected -->
      ${state.pendingSyncData ? `
        <section class="glass-panel border-indigo-500/50 bg-indigo-950/40 p-4 sm:p-5 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in shadow-2xl">
          <div class="flex items-start sm:items-center space-x-3">
            <div class="p-2 bg-indigo-500 text-white rounded-xl">
              ${icon('sparkles', 'w-5 h-5')}
            </div>
            <div>
              <h4 class="font-bold text-white text-sm sm:text-base">Incoming Band Update Available</h4>
              <p class="text-xs text-indigo-200">
                Shared update for <strong>${escapeHtml(state.pendingSyncData.bandName || 'Band')}</strong>. Next up to pay: <strong>${escapeHtml(state.pendingSyncData.queue[0]?.name || 'N/A')}</strong>.
              </p>
            </div>
          </div>
          <div class="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button id="btn-sync-dismiss" class="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800 rounded-xl transition-colors">
              Ignore
            </button>
            <button id="btn-sync-apply" class="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg transition-colors">
              Apply Update
            </button>
          </div>
        </section>
      ` : ''}

      <!-- HERO CARD: WHO PAYS NEXT -->
      <section class="relative overflow-hidden rounded-3xl glass-card border border-slate-800 p-6 sm:p-8 shadow-2xl animate-pulse-glow">
        <div class="absolute -top-16 -right-16 w-56 h-56 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div class="space-y-2.5">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase badge-indigo">
                <span class="mr-1.5">${icon('sparkles', 'w-3.5 h-3.5')}</span>
                Due To Pay Next Rehearsal
              </span>
              ${hasUndo ? `
                <button id="btn-hero-undo" title="Undo last payment rotation" class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/80 border border-slate-700 hover:border-slate-600 transition-colors">
                  ${icon('rotateCcw', 'w-3 h-3')}
                  <span>Undo</span>
                </button>
              ` : ''}
            </div>

            <h2 id="current-payer-name" class="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">
              ${escapeHtml(currentPayer.name)}
            </h2>

            <div class="flex items-center gap-3">
              <p class="text-slate-400 text-sm font-medium flex items-center gap-1.5">
                <span class="text-indigo-400">${icon('music', 'w-4 h-4')}</span>
                <span>${escapeHtml(currentPayer.role || 'Band Member')}</span>
              </p>
              ${state.queue.length > 1 ? `
                <button id="btn-skip-turn" class="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 hover:underline ml-2">
                  ${icon('skipForward', 'w-3.5 h-3.5')}
                  <span>Absent / Swap Turn</span>
                </button>
              ` : ''}
            </div>
          </div>

          <!-- Up Next Preview Card -->
          <div class="w-full md:w-auto bg-slate-950/70 rounded-2xl p-4 border border-slate-800/90 text-left md:text-right min-w-[210px] flex-shrink-0">
            <span class="text-[11px] text-slate-400 uppercase tracking-wider font-bold block mb-1">
              Up Next Afterwards
            </span>
            <span class="text-xl font-bold text-slate-100 block">
              ${escapeHtml(nextPayer.name)}
            </span>
            <span class="text-xs text-slate-400 block mt-0.5">
              ${escapeHtml(nextPayer.role || '')}
            </span>
          </div>
        </div>

        <!-- Payment input and Action Button -->
        <div class="mt-6 pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row gap-3">
          <input
            id="cost-note-input"
            type="text"
            placeholder="Optional note e.g. '$60 at Soundstage' or 'Studio A 2hrs'"
            class="flex-grow bg-slate-950/80 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-2xl px-4 py-3.5 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all"
          />

          <button
            id="btn-mark-paid"
            class="w-full sm:w-auto bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:brightness-110 text-white font-bold px-7 py-3.5 rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center space-x-2.5 transition-all btn-press cursor-pointer flex-shrink-0 text-sm sm:text-base"
          >
            <span>${icon('checkCircle', 'w-5 h-5')}</span>
            <span>Mark Paid & Advance Queue</span>
          </button>
        </div>
      </section>

      <!-- ROTATIONAL ORDER QUEUE -->
      <section class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <span class="text-indigo-400">${icon('listOrdered', 'w-4 h-4')}</span>
            <span>Current Rotation Order</span>
          </h3>
          <span class="text-xs font-medium text-slate-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
            ${state.queue.length} Active Member${state.queue.length === 1 ? '' : 's'}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          ${state.queue.map((member, index) => {
            const isCurrent = index === 0;
            const isNext = index === 1;
            return `
              <div class="rounded-2xl p-4 border transition-all ${
                isCurrent
                  ? 'bg-indigo-950/40 border-indigo-500/60 shadow-lg ring-1 ring-indigo-500/40'
                  : isNext
                  ? 'bg-slate-900/80 border-slate-700/80'
                  : 'bg-slate-900/40 border-slate-800/80 text-slate-300'
              }">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-extrabold px-2 py-0.5 rounded-md ${
                    isCurrent
                      ? 'bg-indigo-600 text-white'
                      : isNext
                      ? 'bg-slate-800 text-indigo-300 border border-slate-700'
                      : 'bg-slate-800/80 text-slate-400'
                  }">
                    #${index + 1}
                  </span>
                  ${isCurrent ? `
                    <span class="text-[10px] font-extrabold uppercase tracking-wide text-indigo-400 animate-pulse">
                      Paying Now
                    </span>
                  ` : isNext ? `
                    <span class="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Next Up
                    </span>
                  ` : ''}
                </div>
                <p class="font-bold text-slate-100 truncate text-base">${escapeHtml(member.name)}</p>
                <p class="text-xs text-slate-400 truncate mt-0.5">${escapeHtml(member.role || 'Member')}</p>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- REHEARSAL PAYMENT HISTORY LOG -->
      <section class="bg-slate-900/50 border border-slate-800/90 rounded-3xl p-5 sm:p-7 space-y-4">
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-2">
            <span class="text-indigo-400">${icon('history', 'w-5 h-5')}</span>
            <h3 class="font-bold text-slate-100 text-base">Payment History</h3>
            <span class="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-medium ml-1">
              ${state.history.length}
            </span>
          </div>

          <div class="flex items-center gap-2">
            ${state.history.length > 0 ? `
              <button 
                id="btn-clear-history"
                class="text-xs text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-800/80"
              >
                ${icon('trash2', 'w-3.5 h-3.5')}
                <span>Clear</span>
              </button>
            ` : ''}
          </div>
        </div>

        ${state.history.length === 0 ? `
          <div class="text-center py-10 text-slate-500 space-y-2">
            <div class="w-10 h-10 mx-auto text-slate-600">${icon('history', 'w-10 h-10')}</div>
            <p class="text-sm font-medium text-slate-400">No payment history recorded yet.</p>
            <p class="text-xs text-slate-500">When someone pays for rehearsal and you click the button above, records appear here.</p>
          </div>
        ` : `
          <div class="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            ${state.history.map((entry) => `
              <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-slate-950/70 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-colors gap-2">
                <div class="flex items-center space-x-3 min-w-0">
                  <div class="p-2 rounded-xl bg-slate-800 text-indigo-400 flex-shrink-0">
                    ${icon('userCheck', 'w-4 h-4')}
                  </div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="font-bold text-slate-200 text-sm">${escapeHtml(entry.payerName)}</span>
                      ${entry.payerRole ? `
                        <span class="text-xs text-slate-400">(${escapeHtml(entry.payerRole)})</span>
                      ` : ''}
                    </div>
                    ${entry.note ? `
                      <p class="text-xs text-amber-300/90 font-medium mt-0.5 break-words">${escapeHtml(entry.note)}</p>
                    ` : ''}
                  </div>
                </div>

                <div class="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-400 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                  <div class="flex items-center space-x-1.5">
                    <span class="text-slate-500">${icon('clock', 'w-3.5 h-3.5')}</span>
                    <span>${formatDate(entry.timestamp)}</span>
                  </div>
                  <button 
                    data-delete-history="${entry.id}"
                    title="Delete record"
                    class="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                  >
                    ${icon('trash2', 'w-3.5 h-3.5')}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>

    </main>

    <!-- Footer -->
    <footer class="border-t border-slate-800/80 py-6 text-center text-xs text-slate-400 space-y-2">
      <p>Data saved automatically in browser • Zero server required</p>
      <div class="flex items-center justify-center gap-4 text-slate-400">
        <button id="footer-btn-stats" class="hover:text-indigo-400 transition-colors">Payment Statistics</button>
        <span>•</span>
        <button id="footer-btn-share" class="hover:text-indigo-400 transition-colors">Share / Sync Link</button>
        <span>•</span>
        <button id="footer-btn-export" class="hover:text-indigo-400 transition-colors">Export / Backup</button>
      </div>
    </footer>

    <!-- ROSTER MANAGEMENT MODAL -->
    ${state.isRosterModalOpen ? renderRosterModal() : ''}

    <!-- SHARE & SYNC MODAL -->
    ${state.isShareModalOpen ? renderShareModal() : ''}

    <!-- STATISTICS MODAL -->
    ${state.isStatsModalOpen ? renderStatsModal() : ''}
  `;

  attachEventListeners();
}

/**
 * Render Roster Management Modal
 */
function renderRosterModal() {
  return `
    <div class="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-6 my-8 animate-fade-in">
        
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-2">
            <span class="text-indigo-400">${icon('userCog', 'w-5 h-5')}</span>
            <h3 class="font-extrabold text-slate-100 text-lg">Manage Band Roster</h3>
          </div>
          <button id="modal-close-roster" class="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <!-- Band Name Config -->
        <div class="space-y-2">
          <label class="text-xs font-bold text-slate-400 uppercase tracking-wider block">Band Name</label>
          <input
            id="roster-band-name-input"
            type="text"
            value="${escapeHtml(state.bandName)}"
            placeholder="e.g. The Soundwaves"
            class="w-full bg-slate-950 border border-slate-700 focus:border-indigo-500 rounded-xl px-3.5 py-2 text-sm text-slate-100 outline-none"
          />
        </div>

        <!-- Member Queue List with Reordering -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-wider">Queue Members & Order</label>
            <span class="text-xs text-slate-400">Top pays first</span>
          </div>

          <div class="space-y-2 max-h-64 overflow-y-auto pr-1">
            ${state.queue.map((member, idx) => `
              <div class="flex items-center space-x-2 bg-slate-950/70 p-2.5 rounded-2xl border border-slate-800">
                <span class="text-xs font-extrabold text-indigo-400 w-6 text-center flex-shrink-0">
                  #${idx + 1}
                </span>

                <input
                  type="text"
                  data-member-index="${idx}"
                  data-field="name"
                  value="${escapeHtml(member.name)}"
                  placeholder="Name"
                  class="flex-1 min-w-0 bg-slate-900 border border-slate-700/80 focus:border-indigo-500 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm text-slate-100 outline-none"
                />

                <input
                  type="text"
                  data-member-index="${idx}"
                  data-field="role"
                  value="${escapeHtml(member.role || '')}"
                  placeholder="Instrument / Role"
                  class="flex-1 min-w-0 bg-slate-900 border border-slate-700/80 focus:border-indigo-500 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm text-slate-100 outline-none"
                />

                <div class="flex items-center space-x-1 flex-shrink-0">
                  <button 
                    data-move-up="${idx}" 
                    title="Move up in rotation"
                    class="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg ${idx === 0 ? 'opacity-30 cursor-not-allowed' : ''}"
                    ${idx === 0 ? 'disabled' : ''}
                  >
                    ${icon('arrowUp', 'w-4 h-4')}
                  </button>
                  <button 
                    data-move-down="${idx}" 
                    title="Move down in rotation"
                    class="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg ${idx === state.queue.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}"
                    ${idx === state.queue.length - 1 ? 'disabled' : ''}
                  >
                    ${icon('arrowDown', 'w-4 h-4')}
                  </button>
                  <button 
                    data-remove-member="${idx}" 
                    title="Remove from roster"
                    class="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg"
                  >
                    ${icon('trash2', 'w-4 h-4')}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Add New Member Form -->
        <div class="pt-2 border-t border-slate-800">
          <form id="form-add-member" class="flex flex-col sm:flex-row gap-2">
            <input 
              id="new-member-name" 
              type="text" 
              placeholder="New member name" 
              required
              class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
            <input 
              id="new-member-role" 
              type="text" 
              placeholder="Instrument (e.g. Bass)" 
              class="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
            <button 
              type="submit"
              class="px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1 border border-indigo-500/30"
            >
              ${icon('plus', 'w-4 h-4')}
              <span>Add</span>
            </button>
          </form>
        </div>

        <!-- Modal Actions -->
        <div class="flex items-center justify-between pt-4 border-t border-slate-800">
          <button 
            id="btn-reset-roster"
            type="button"
            class="text-xs text-slate-400 hover:text-red-400 transition-colors"
          >
            Reset to Defaults
          </button>
          <div class="flex space-x-2">
            <button
              id="modal-btn-done"
              type="button"
              class="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg transition-colors"
            >
              Done & Save
            </button>
          </div>
        </div>

      </div>
    </div>
  `;
}

/**
 * Render Share Modal
 */
function renderShareModal() {
  const syncUrl = getSyncUrl();
  const currentPayer = state.queue[0]?.name || 'N/A';

  return `
    <div class="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-6 animate-fade-in">
        
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-2">
            <span class="text-indigo-400">${icon('share2', 'w-5 h-5')}</span>
            <h3 class="font-extrabold text-slate-100 text-lg">Share & Sync with Band</h3>
          </div>
          <button id="modal-close-share" class="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <p class="text-xs text-slate-300 leading-relaxed">
          Because this tracker runs directly on GitHub Pages without a backend database, you can keep your whole band in sync with <strong>Sync Links</strong>.
        </p>

        <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-400 font-semibold">Current Due:</span>
            <span class="text-indigo-400 font-bold">${escapeHtml(currentPayer)}</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-400 font-semibold">Active Members:</span>
            <span class="text-slate-200">${state.queue.length}</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-400 font-semibold">History Entries:</span>
            <span class="text-slate-200">${state.history.length}</span>
          </div>
        </div>

        <!-- 1-Tap Share Button -->
        <button 
          id="btn-native-share"
          class="w-full bg-gradient-to-r from-indigo-600 to-indigo-500 hover:brightness-110 text-white font-bold py-3.5 px-4 rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2 text-sm btn-press"
        >
          ${icon('share2', 'w-5 h-5')}
          <span>Share to Band Chat (WhatsApp / Messenger)</span>
        </button>

        <!-- Copy Link Input -->
        <div class="space-y-1.5">
          <label class="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Direct Sync URL</label>
          <div class="flex items-center space-x-2">
            <input 
              id="share-link-input" 
              type="text" 
              readonly 
              value="${escapeHtml(syncUrl)}"
              class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 outline-none select-all"
            />
            <button 
              id="btn-copy-sync-link"
              class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              ${icon('copy', 'w-4 h-4')}
              <span>Copy</span>
            </button>
          </div>
        </div>

        <!-- Tip -->
        <div class="text-[11px] text-slate-400 bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-3">
          💡 When band members click this link on their phones, their tracker will prompt them to sync with one tap!
        </div>

      </div>
    </div>
  `;
}

/**
 * Render Statistics Modal
 */
function renderStatsModal() {
  const stats = getMemberStats();
  const totalRehearsals = state.history.length;

  return `
    <div class="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl space-y-6 animate-fade-in">
        
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center space-x-2">
            <span class="text-indigo-400">${icon('barChart', 'w-5 h-5')}</span>
            <h3 class="font-extrabold text-slate-100 text-lg">Payment Statistics</h3>
          </div>
          <button id="modal-close-stats" class="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <span class="text-xs text-slate-400 block font-semibold">Total Paid Sessions</span>
            <span class="text-2xl font-black text-indigo-400 mt-1 block">${totalRehearsals}</span>
          </div>
          <div class="bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <span class="text-xs text-slate-400 block font-semibold">Active Roster Size</span>
            <span class="text-2xl font-black text-slate-100 mt-1 block">${state.queue.length}</span>
          </div>
        </div>

        <div class="space-y-3">
          <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Payments Logged Per Member</h4>
          
          <div class="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            ${Object.entries(stats).map(([name, count]) => {
              const pct = totalRehearsals > 0 ? Math.round((count / totalRehearsals) * 100) : 0;
              return `
                <div class="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80 space-y-1.5">
                  <div class="flex justify-between items-center text-xs">
                    <span class="font-bold text-slate-200">${escapeHtml(name)}</span>
                    <span class="text-indigo-400 font-semibold">${count} rehearsal${count === 1 ? '' : 's'} (${pct}%)</span>
                  </div>
                  <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div class="bg-indigo-500 h-1.5 rounded-full transition-all" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pt-2 border-t border-slate-800 flex justify-end">
          <button 
            id="modal-stats-done"
            class="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  `;
}

/**
 * Event Listeners Binding
 */
function attachEventListeners() {
  // Sound toggle
  const soundBtn = document.getElementById('btn-sound-toggle');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      saveState();
      render();
    });
  }

  // Mark Paid & Advance Queue
  const markPaidBtn = document.getElementById('btn-mark-paid');
  const noteInput = document.getElementById('cost-note-input');
  if (markPaidBtn) {
    markPaidBtn.addEventListener('click', () => {
      const note = noteInput ? noteInput.value : '';
      advanceQueue(note);
    });
  }

  if (noteInput) {
    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        advanceQueue(noteInput.value);
      }
    });
  }

  // Hero Undo Button
  const heroUndoBtn = document.getElementById('btn-hero-undo');
  if (heroUndoBtn) {
    heroUndoBtn.addEventListener('click', undoLastAction);
  }

  // Skip / Swap Turn
  const skipTurnBtn = document.getElementById('btn-skip-turn');
  if (skipTurnBtn) {
    skipTurnBtn.addEventListener('click', skipTurn);
  }

  // Clear History
  const clearHistoryBtn = document.getElementById('btn-clear-history');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', clearHistory);
  }

  // Individual Delete History Buttons
  document.querySelectorAll('[data-delete-history]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete-history');
      deleteHistoryEntry(id);
    });
  });

  // Modal Triggers
  const rosterBtn = document.getElementById('btn-roster-open');
  if (rosterBtn) {
    rosterBtn.addEventListener('click', () => {
      state.isRosterModalOpen = true;
      render();
    });
  }

  const shareBtn = document.getElementById('btn-share-open');
  const footerShareBtn = document.getElementById('footer-btn-share');
  [shareBtn, footerShareBtn].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        state.isShareModalOpen = true;
        render();
      });
    }
  });

  const statsBtn = document.getElementById('btn-stats-open');
  const footerStatsBtn = document.getElementById('footer-btn-stats');
  [statsBtn, footerStatsBtn].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        state.isStatsModalOpen = true;
        render();
      });
    }
  });

  // Export / Backup
  const footerExportBtn = document.getElementById('footer-btn-export');
  if (footerExportBtn) {
    footerExportBtn.addEventListener('click', exportBackupJson);
  }

  // Sync Banner Actions
  const syncApplyBtn = document.getElementById('btn-sync-apply');
  if (syncApplyBtn) syncApplyBtn.addEventListener('click', applyIncomingSync);

  const syncDismissBtn = document.getElementById('btn-sync-dismiss');
  if (syncDismissBtn) syncDismissBtn.addEventListener('click', dismissIncomingSync);

  // Close Modals
  const closeRosterBtn = document.getElementById('modal-close-roster');
  const doneRosterBtn = document.getElementById('modal-btn-done');
  [closeRosterBtn, doneRosterBtn].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        state.isRosterModalOpen = false;
        render();
      });
    }
  });

  const closeShareBtn = document.getElementById('modal-close-share');
  if (closeShareBtn) {
    closeShareBtn.addEventListener('click', () => {
      state.isShareModalOpen = false;
      render();
    });
  }

  const closeStatsBtn = document.getElementById('modal-close-stats');
  const doneStatsBtn = document.getElementById('modal-stats-done');
  [closeStatsBtn, doneStatsBtn].forEach(b => {
    if (b) {
      b.addEventListener('click', () => {
        state.isStatsModalOpen = false;
        render();
      });
    }
  });

  // Roster Modal Listeners
  if (state.isRosterModalOpen) {
    const bandNameInput = document.getElementById('roster-band-name-input');
    if (bandNameInput) {
      bandNameInput.addEventListener('input', (e) => {
        state.bandName = e.target.value.trim() || DEFAULT_BAND_NAME;
        saveState();
      });
    }

    // Member inputs
    document.querySelectorAll('[data-member-index]').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(input.getAttribute('data-member-index'), 10);
        const field = input.getAttribute('data-field');
        if (state.queue[idx]) {
          state.queue[idx][field] = e.target.value;
          saveState();
        }
      });
    });

    // Move Up
    document.querySelectorAll('[data-move-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-move-up'), 10);
        if (idx > 0) {
          const item = state.queue.splice(idx, 1)[0];
          state.queue.splice(idx - 1, 0, item);
          saveState();
          render();
        }
      });
    });

    // Move Down
    document.querySelectorAll('[data-move-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-move-down'), 10);
        if (idx < state.queue.length - 1) {
          const item = state.queue.splice(idx, 1)[0];
          state.queue.splice(idx + 1, 0, item);
          saveState();
          render();
        }
      });
    });

    // Remove Member
    document.querySelectorAll('[data-remove-member]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-remove-member'), 10);
        if (state.queue.length <= 1) {
          alert('You must have at least one member in the roster.');
          return;
        }
        const member = state.queue[idx];
        if (window.confirm(`Remove ${member.name} from the rotation?`)) {
          state.queue.splice(idx, 1);
          saveState();
          render();
        }
      });
    });

    // Add Member Form
    const addMemberForm = document.getElementById('form-add-member');
    if (addMemberForm) {
      addMemberForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('new-member-name');
        const roleInput = document.getElementById('new-member-role');
        const name = nameInput.value.trim();
        const role = roleInput.value.trim() || 'Band Member';

        if (name) {
          state.queue.push({
            id: 'm_' + Date.now(),
            name,
            role
          });
          saveState();
          nameInput.value = '';
          roleInput.value = '';
          render();
        }
      });
    }

    // Reset Roster
    const resetRosterBtn = document.getElementById('btn-reset-roster');
    if (resetRosterBtn) {
      resetRosterBtn.addEventListener('click', () => {
        if (window.confirm('Reset roster to default band members?')) {
          state.queue = [...DEFAULT_MEMBERS];
          state.bandName = DEFAULT_BAND_NAME;
          saveState();
          render();
        }
      });
    }
  }

  // Share Modal Listeners
  if (state.isShareModalOpen) {
    const nativeShareBtn = document.getElementById('btn-native-share');
    if (nativeShareBtn) {
      nativeShareBtn.addEventListener('click', shareBandUpdate);
    }

    const copyBtn = document.getElementById('btn-copy-sync-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const url = getSyncUrl();
        try {
          await navigator.clipboard.writeText(url);
          showToast('Sync link copied to clipboard!');
        } catch (e) {
          const input = document.getElementById('share-link-input');
          if (input) {
            input.select();
            document.execCommand('copy');
            showToast('Sync link copied!');
          }
        }
      });
    }
  }
}

/**
 * Backup / Export JSON
 */
function exportBackupJson() {
  const data = {
    bandName: state.bandName,
    queue: state.queue,
    history: state.history,
    exportedAt: new Date().toISOString()
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.bandName.toLowerCase().replace(/\s+/g, '-')}-rehearsal-data.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup JSON downloaded.');
}

/**
 * Escapes HTML to prevent XSS.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Register Service Worker for offline PWA
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => {
        console.log('SW registration note:', err);
      });
    });
  }
}

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  checkIncomingSync();
  render();
  registerServiceWorker();

  // Listen to hash changes if someone clicks a sync link while page is open
  window.addEventListener('hashchange', () => {
    checkIncomingSync();
    render();
  });
});
