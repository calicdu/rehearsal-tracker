/**
 * Band Rehearsal Tracker - Modern Obsidian & Slate Edition
 * Featuring Automatic Real-Time Cloud Sync (Firebase Realtime Database)
 * Zero SDK dependencies - uses native fetch + EventSource streaming.
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
  activeModal: null, // 'roster' | 'share' | 'stats' | 'cloud' | null
  firebaseUrl: '',
  cloudStatus: 'unconfigured', // 'connected' | 'connecting' | 'unconfigured' | 'offline'
  isSyncing: false
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
 * Subtle, modern acoustic click on action.
 */
function playTactileFeedback() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.035);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  } catch (e) {}
}

/**
 * Get active Firebase database URL
 */
function getActiveFirebaseUrl() {
  const fromState = (state.firebaseUrl || '').trim();
  const fromConfig = (typeof CLOUD_CONFIG !== 'undefined' && CLOUD_CONFIG.firebaseDbUrl ? CLOUD_CONFIG.firebaseDbUrl : '').trim();
  const raw = fromState || fromConfig;
  return raw.replace(/\/+$/, '');
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

    const savedFbUrl = localStorage.getItem('band_firebase_url');
    if (savedFbUrl) state.firebaseUrl = savedFbUrl;
  } catch (e) {
    console.error('Failed to load local state:', e);
  }
}

function saveState(skipCloud = false) {
  try {
    localStorage.setItem('band_pay_queue', JSON.stringify(state.queue));
    localStorage.setItem('band_pay_history', JSON.stringify(state.history));
    localStorage.setItem('band_pay_name', state.bandName);
    localStorage.setItem('band_pay_sound', String(state.soundEnabled));
    if (state.firebaseUrl) localStorage.setItem('band_firebase_url', state.firebaseUrl);

    if (!skipCloud) {
      syncToCloud();
    }
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

/**
 * Cloud Sync: Push update to Firebase Realtime Database
 */
async function syncToCloud() {
  const url = getActiveFirebaseUrl();
  if (!url) return;

  state.isSyncing = true;
  try {
    const payload = {
      bandName: state.bandName,
      queue: state.queue,
      history: state.history.slice(0, 50),
      updatedAt: Date.now()
    };

    const res = await fetch(`${url}/rehearsal.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      state.cloudStatus = 'connected';
    } else {
      console.warn('Firebase sync HTTP error:', res.status);
      state.cloudStatus = 'offline';
    }
  } catch (err) {
    console.warn('Firebase network error:', err);
    state.cloudStatus = 'offline';
  } finally {
    state.isSyncing = false;
    render();
  }
}

/**
 * Cloud Sync: Fetch state from Firebase Realtime Database
 */
async function fetchFromCloud() {
  const url = getActiveFirebaseUrl();
  if (!url) {
    state.cloudStatus = 'unconfigured';
    return false;
  }

  state.cloudStatus = 'connecting';
  render();

  try {
    const res = await fetch(`${url}/rehearsal.json`);
    if (!res.ok) {
      state.cloudStatus = 'offline';
      render();
      return false;
    }

    const data = await res.json();
    if (data && Array.isArray(data.queue) && data.queue.length > 0) {
      state.queue = data.queue;
      if (data.bandName) state.bandName = data.bandName;
      if (Array.isArray(data.history)) state.history = data.history;
      saveState(true); // save to localStorage without re-pushing
      state.cloudStatus = 'connected';
      render();
      return true;
    } else {
      // Database exists but is empty -> push our current state to populate it
      await syncToCloud();
      state.cloudStatus = 'connected';
      render();
      return true;
    }
  } catch (err) {
    console.warn('Failed to fetch from Firebase:', err);
    state.cloudStatus = 'offline';
    render();
    return false;
  }
}

/**
 * Real-time SSE Live Stream (Server-Sent Events)
 * Automatically updates this device whenever ANY other bandmate marks paid!
 */
let cloudEventSource = null;
function initRealtimeLiveSync() {
  const url = getActiveFirebaseUrl();
  if (!url) return;

  if (cloudEventSource) {
    cloudEventSource.close();
    cloudEventSource = null;
  }

  try {
    // Native browser EventSource connecting to Firebase RTDB stream
    cloudEventSource = new EventSource(`${url}/rehearsal.json`);

    cloudEventSource.addEventListener('put', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (!payload) return;

        if (payload.path === '/' && payload.data && Array.isArray(payload.data.queue)) {
          // Check if incoming state is different from local state
          const currentFirstId = state.queue[0]?.id;
          const incomingFirstId = payload.data.queue[0]?.id;
          const historyChanged = (payload.data.history?.length || 0) !== state.history.length;

          state.queue = payload.data.queue;
          if (payload.data.bandName) state.bandName = payload.data.bandName;
          if (Array.isArray(payload.data.history)) state.history = payload.data.history;

          saveState(true);
          state.cloudStatus = 'connected';

          if (currentFirstId !== incomingFirstId || historyChanged) {
            playTactileFeedback();
            const nextPayer = state.queue[0]?.name || 'Next member';
            showToast(`Live update from bandmate! Next up: ${nextPayer}`);
          }
          render();
        } else if (payload.path && payload.path !== '/') {
          // Sub-path change, trigger full fetch
          fetchFromCloud();
        }
      } catch (parseErr) {
        console.warn('SSE parsing error:', parseErr);
      }
    });

    cloudEventSource.onopen = () => {
      state.cloudStatus = 'connected';
      render();
    };

    cloudEventSource.onerror = () => {
      // EventSource auto-reconnects natively
      state.cloudStatus = 'offline';
      render();
    };
  } catch (err) {
    console.warn('EventSource initialization error:', err);
  }
}

/**
 * Modern Toast Alert
 */
let toastTimer = null;
function showToast(message, actionText = null, onAction = null, duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  if (toastTimer) clearTimeout(toastTimer);

  container.innerHTML = `
    <div class="bg-[#151924] border border-[#273044] text-[#f8fafc] px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-sm toast-anim">
      <span class="font-medium truncate">${message}</span>
      ${actionText ? `
        <button id="toast-action-btn" class="flex-shrink-0 text-xs font-bold bg-[#d4d9e1] hover:bg-[#c3c9d4] text-[#0b0e14] px-3 py-1.5 rounded-xl tap-btn">
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

  toastTimer = setTimeout(() => {
    container.innerHTML = '';
  }, duration);
}

/**
 * Format timestamp cleanly for mobile screens
 */
function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch (e) {
    return isoString;
  }
}

/**
 * Core Rotation Actions
 */
function advanceQueue(customNote = '') {
  if (state.queue.length === 0) return;

  // Snapshot for instant Undo
  state.undoStack.push({
    queue: JSON.parse(JSON.stringify(state.queue)),
    history: JSON.parse(JSON.stringify(state.history))
  });

  const currentPayer = state.queue[0];
  const nextQueue = [...state.queue.slice(1), currentPayer];

  const newEntry = {
    id: 'pay_' + Date.now(),
    payerId: currentPayer.id,
    payerName: currentPayer.name,
    payerRole: currentPayer.role || '',
    timestamp: new Date().toISOString(),
    note: customNote.trim() ? customNote.trim() : null
  };

  state.queue = nextQueue;
  state.history.unshift(newEntry);
  saveState();

  playTactileFeedback();

  const nextPerson = state.queue[0]?.name || 'Next member';
  showToast(`${currentPayer.name} paid. ${nextPerson} is up next.`, 'Undo', undoLastAction, 5500);

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

  playTactileFeedback();
  showToast('Rehearsal rotation reverted.');
  render();
}

function swapTurn() {
  if (state.queue.length < 2) return;

  state.undoStack.push({
    queue: JSON.parse(JSON.stringify(state.queue)),
    history: JSON.parse(JSON.stringify(state.history))
  });

  const first = state.queue[0];
  const second = state.queue[1];
  const rest = state.queue.slice(2);

  state.queue = [second, first, ...rest];
  saveState();

  playTactileFeedback();
  showToast(`Swapped: ${second.name} is now paying; ${first.name} moved to #2.`);
  render();
}

function deleteHistoryEntry(id) {
  const entry = state.history.find(h => h.id === id);
  if (!entry) return;

  if (window.confirm(`Delete record for ${entry.payerName}?`)) {
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

function clearHistory() {
  if (state.history.length === 0) return;
  if (window.confirm('Clear all payment history?')) {
    state.undoStack.push({
      queue: JSON.parse(JSON.stringify(state.queue)),
      history: JSON.parse(JSON.stringify(state.history))
    });
    state.history = [];
    saveState();
    showToast('History cleared.', 'Undo', undoLastAction);
    render();
  }
}

/**
 * Member Statistics
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
 * Core Render Loop (Modern Obsidian & Slate)
 */
function render() {
  const app = document.getElementById('root');
  if (!app) return;

  const currentPayer = state.queue[0] || { name: 'No Members', role: 'Tap Roster to add' };
  const nextPayer = state.queue[1] || (state.queue[0] ? { name: state.queue[0].name, role: 'Only 1 member' } : { name: '-', role: '' });
  const hasUndo = state.undoStack.length > 0;
  const isCloudConnected = state.cloudStatus === 'connected';

  app.innerHTML = `
    <!-- Top Modern Header -->
    <header class="py-3.5 flex items-center justify-between border-b border-[#1f2433] gap-2">
      <div class="flex items-center space-x-2.5 min-w-0 flex-1">
        <div class="w-8 h-8 rounded-lg bg-[#141824] border border-[#23293a] flex items-center justify-center text-sky-400 flex-shrink-0">
          ${icon('music', 'w-4 h-4')}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h1 class="text-base font-bold text-white truncate leading-tight">${escapeHtml(state.bandName)}</h1>
            <!-- Cloud Status Badge -->
            <button 
              id="header-btn-cloud-status"
              title="${isCloudConnected ? 'Connected to Firebase (Realtime Live Sync)' : 'Firebase cloud sync not connected. Tap to setup.'}"
              class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium tap-btn ${
                isCloudConnected 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' 
                  : state.cloudStatus === 'connecting'
                  ? 'bg-sky-500/10 text-sky-400 border border-sky-500/25'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
              }"
            >
              <span class="w-1.5 h-1.5 rounded-full ${isCloudConnected ? 'bg-emerald-400 animate-pulse' : state.cloudStatus === 'connecting' ? 'bg-sky-400 animate-ping' : 'bg-amber-400'}"></span>
              <span>${isCloudConnected ? 'Live' : state.cloudStatus === 'connecting' ? 'Syncing' : 'Cloud Setup'}</span>
            </button>
          </div>
          <p class="text-[11px] text-[#94a3b8] truncate font-mono">${state.queue.length} in rotation</p>
        </div>
      </div>

      <div class="flex items-center space-x-0.5 flex-shrink-0">
        <button 
          id="btn-sound-toggle"
          title="${state.soundEnabled ? 'Mute' : 'Unmute'}"
          class="w-8 h-8 flex items-center justify-center text-[#94a3b8] hover:text-white rounded-lg hover:bg-[#141824] tap-btn"
        >
          ${icon(state.soundEnabled ? 'volume2' : 'volumeX', 'w-4 h-4')}
        </button>

        <button 
          id="btn-open-stats"
          title="Payment Stats"
          class="w-8 h-8 flex items-center justify-center text-[#94a3b8] hover:text-white rounded-lg hover:bg-[#141824] tap-btn"
        >
          ${icon('barChart', 'w-4 h-4')}
        </button>

        <button 
          id="btn-open-roster"
          title="Roster & Cloud Settings"
          class="w-8 h-8 flex items-center justify-center text-[#94a3b8] hover:text-white rounded-lg hover:bg-[#141824] tap-btn"
        >
          ${icon('settings', 'w-4 h-4')}
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="py-4 space-y-4 flex-grow">

      <!-- Unconfigured Cloud Banner (Encouraging 1-time setup) -->
      ${state.cloudStatus === 'unconfigured' ? `
        <div class="lean-card p-3.5 bg-[#121622] border-amber-500/30 flex items-center justify-between gap-3 shadow-sm">
          <div class="min-w-0 text-xs flex-1">
            <span class="font-bold text-amber-400 block">Auto-Sync Across All Phones</span>
            <span class="text-[#94a3b8] truncate block">Connect a free Firebase database URL so every band member's phone updates automatically.</span>
          </div>
          <button id="btn-banner-cloud-setup" class="px-3 py-1.5 text-xs font-bold bg-[#d4d9e1] hover:bg-[#c3c9d4] text-[#0b0e14] rounded-lg tap-btn flex-shrink-0">
            Setup
          </button>
        </div>
      ` : ''}

      <!-- HERO: WHO PAYS NEXT (Crisp Modern Card) -->
      <section class="lean-card p-4 sm:p-5 space-y-4 shadow-sm">
        
        <!-- Header row on card: Label & Quick Actions -->
        <div class="flex items-center justify-between gap-2">
          <span class="badge-pill px-2.5 py-1 rounded-md bg-[#161a26] text-sky-400 border border-[#252c40] flex-shrink-0">
            #01 • NEXT REHEARSAL
          </span>
          
          <div class="flex items-center gap-2 flex-shrink-0">
            ${state.queue.length > 1 ? `
              <button id="btn-swap-turn" class="text-xs font-medium text-[#94a3b8] hover:text-white flex items-center gap-1 tap-btn">
                ${icon('swap', 'w-3.5 h-3.5')}
                <span>Swap turn</span>
              </button>
            ` : ''}

            ${hasUndo ? `
              <button id="btn-hero-undo" class="text-xs font-medium text-[#94a3b8] hover:text-white flex items-center gap-1 tap-btn">
                ${icon('rotateCcw', 'w-3.5 h-3.5')}
                <span>Undo</span>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Big Payer Name -->
        <div>
          <div class="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none break-words">
            ${escapeHtml(currentPayer.name)}
          </div>
          <div class="text-sm font-medium text-[#94a3b8] mt-1.5 truncate">
            ${escapeHtml(currentPayer.role || 'Band Member')}
          </div>
        </div>

        <!-- Up Next Preview Row -->
        <div class="flex items-center justify-between py-2.5 px-3 rounded-xl bg-[#0c0e14] border border-[#1b202e] text-xs gap-2">
          <span class="text-[#94a3b8] font-medium flex-shrink-0">Up next afterwards:</span>
          <span class="font-bold text-white truncate text-right">
            ${escapeHtml(nextPayer.name)} <span class="text-[#94a3b8] font-normal truncate">(${escapeHtml(nextPayer.role || '')})</span>
          </span>
        </div>

        <!-- Optional Session Note Input -->
        <div>
          <input
            id="cost-note-input"
            type="text"
            placeholder="Add note (e.g. $50 @ Soundstage)"
            class="w-full bg-[#0c0e14] border border-[#1e2332] focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 rounded-xl px-3.5 py-3 text-sm text-white placeholder-[#525d73] outline-none transition-all"
          />
        </div>

        <!-- PRIMARY ACTION: Tamed Matte Silver-Gray Button (Glare-free) -->
        <button
          id="btn-mark-paid"
          class="w-full min-h-[52px] py-3.5 px-4 bg-[#d4d9e1] hover:bg-[#c3c9d4] text-[#0b0e14] font-bold text-sm sm:text-base rounded-xl flex items-center justify-center gap-2 tap-btn shadow-sm leading-tight text-center border border-[#e2e8f0]/30"
        >
          <span>${escapeHtml(currentPayer.name)} Paid</span>
          <span class="text-[#64748b]">•</span>
          <span>Rotate to ${escapeHtml(nextPayer.name)}</span>
          ${icon('arrowRight', 'w-4 h-4 text-[#0b0e14]')}
        </button>

      </section>

      <!-- ROTATION QUEUE (Modern Vertical Stream) -->
      <section class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <span class="text-xs font-semibold text-[#64748b] uppercase tracking-wider font-mono">Rotation Queue</span>
          <button id="btn-edit-roster-link" class="text-xs text-sky-400 hover:text-sky-300 font-medium tap-btn">
            Edit Roster
          </button>
        </div>

        <div class="space-y-1.5">
          ${state.queue.map((member, idx) => {
            const isFirst = idx === 0;
            const isSecond = idx === 1;
            return `
              <div class="flex items-center justify-between p-3 rounded-xl border gap-2 transition-colors ${
                isFirst 
                  ? 'bg-[#121622] border-[#2a354c] text-white shadow-sm' 
                  : isSecond
                  ? 'bg-[#0e1118] border-[#1c2130] text-[#f8fafc]'
                  : 'bg-[#0c0e14] border-[#181c28] text-[#94a3b8]'
              }">
                <div class="flex items-center space-x-2.5 min-w-0 flex-1">
                  <span class="font-mono text-xs font-bold w-6 text-center flex-shrink-0 ${isFirst ? 'text-sky-400' : 'text-[#64748b]'}">
                    #${idx + 1 < 10 ? '0' + (idx + 1) : idx + 1}
                  </span>
                  <div class="min-w-0 flex-1">
                    <span class="font-bold text-sm text-white truncate block">${escapeHtml(member.name)}</span>
                    <span class="text-xs text-[#94a3b8] truncate block">${escapeHtml(member.role || 'Member')}</span>
                  </div>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                  ${isFirst ? `
                    <span class="badge-pill px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/25">
                      Paying
                    </span>
                  ` : isSecond ? `
                    <span class="badge-pill px-2 py-0.5 rounded bg-[#181d28] text-[#94a3b8] border border-[#232938]">
                      Up Next
                    </span>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <!-- REHEARSAL HISTORY LOG -->
      <section class="space-y-2 pt-2">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center space-x-1.5 text-xs font-semibold text-[#64748b] uppercase tracking-wider font-mono">
            <span>Payment History</span>
            <span class="text-[#475569]">(${state.history.length})</span>
          </div>

          ${state.history.length > 0 ? `
            <button id="btn-clear-history" class="text-xs text-[#94a3b8] hover:text-red-400 tap-btn">
              Clear
            </button>
          ` : ''}
        </div>

        ${state.history.length === 0 ? `
          <div class="p-5 rounded-2xl bg-[#11141c] border border-[#1f2433] text-center text-xs text-[#64748b]">
            No payment records yet. Tap the button above when someone pays.
          </div>
        ` : `
          <div class="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
            ${state.history.map(item => `
              <div class="flex items-center justify-between p-3 rounded-xl bg-[#11141c] border border-[#1e2332] text-xs gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-white">${escapeHtml(item.payerName)}</span>
                    ${item.payerRole ? `<span class="text-[#94a3b8]">(${escapeHtml(item.payerRole)})</span>` : ''}
                  </div>
                  ${item.note ? `
                    <p class="text-sky-400/90 mt-0.5 font-medium truncate">${escapeHtml(item.note)}</p>
                  ` : ''}
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0 text-[#64748b] font-mono">
                  <span>${formatDate(item.timestamp)}</span>
                  <button data-delete-id="${item.id}" title="Delete" class="hover:text-red-400 p-1 rounded tap-btn">
                    ${icon('trash2', 'w-3.5 h-3.5')}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </section>

    </main>

    <!-- Modern Footer -->
    <footer class="py-4 border-t border-[#1f2433] text-center text-xs text-[#64748b] flex items-center justify-center gap-3">
      <button id="footer-btn-cloud" class="hover:text-white tap-btn">Cloud Sync</button>
      <span>•</span>
      <button id="footer-btn-stats" class="hover:text-white tap-btn">Stats</button>
      <span>•</span>
      <button id="footer-btn-export" class="hover:text-white tap-btn">Backup JSON</button>
    </footer>

    <!-- MOBILE BOTTOM SHEETS -->
    ${state.activeModal === 'roster' ? renderRosterSheet() : ''}
    ${state.activeModal === 'cloud' ? renderCloudSheet() : ''}
    ${state.activeModal === 'stats' ? renderStatsSheet() : ''}
  `;

  attachEventListeners();
}

/**
 * Mobile Bottom Sheet: Roster & Band Settings
 */
function renderRosterSheet() {
  return `
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
      <div class="modal-sheet w-full max-w-lg mx-auto bg-[#11141c] border-t border-[#1f2433] rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        
        <!-- Sheet Drag Handle -->
        <div class="w-10 h-1 bg-[#283042] rounded-full mx-auto"></div>

        <div class="flex items-center justify-between pb-2 border-b border-[#1f2433]">
          <h3 class="font-bold text-white text-base">Band & Roster Settings</h3>
          <button id="modal-close" class="p-1 text-[#94a3b8] hover:text-white tap-btn">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <!-- Band Name Field -->
        <div class="space-y-1">
          <label class="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider font-mono block">Band Name</label>
          <input
            id="sheet-band-name"
            type="text"
            value="${escapeHtml(state.bandName)}"
            class="w-full bg-[#0c0e14] border border-[#1e2332] focus:border-sky-400 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
          />
        </div>

        <!-- Roster Queue Management -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs text-[#94a3b8]">
            <span class="font-semibold uppercase tracking-wider font-mono">Queue Order (Top pays first)</span>
            <span>${state.queue.length} members</span>
          </div>

          <div class="space-y-2 max-h-56 overflow-y-auto pr-0.5">
            ${state.queue.map((m, idx) => `
              <div class="flex items-center space-x-2 bg-[#0c0e14] p-2 rounded-xl border border-[#1c2130]">
                <span class="font-mono text-xs font-bold text-[#64748b] w-5 text-center flex-shrink-0">
                  ${idx + 1}
                </span>

                <input
                  type="text"
                  data-idx="${idx}"
                  data-field="name"
                  value="${escapeHtml(m.name)}"
                  placeholder="Name"
                  class="flex-1 min-w-0 bg-[#141824] border border-[#23293a] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-400"
                />

                <input
                  type="text"
                  data-idx="${idx}"
                  data-field="role"
                  value="${escapeHtml(m.role || '')}"
                  placeholder="Instrument"
                  class="flex-1 min-w-0 bg-[#141824] border border-[#23293a] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-400"
                />

                <div class="flex items-center space-x-1 flex-shrink-0">
                  <button data-up="${idx}" title="Move up" class="p-1.5 text-[#94a3b8] hover:text-white tap-btn ${idx === 0 ? 'opacity-20' : ''}" ${idx === 0 ? 'disabled' : ''}>
                    ${icon('arrowUp', 'w-4 h-4')}
                  </button>
                  <button data-down="${idx}" title="Move down" class="p-1.5 text-[#94a3b8] hover:text-white tap-btn ${idx === state.queue.length - 1 ? 'opacity-20' : ''}" ${idx === state.queue.length - 1 ? 'disabled' : ''}>
                    ${icon('arrowDown', 'w-4 h-4')}
                  </button>
                  <button data-del="${idx}" title="Remove" class="p-1.5 text-[#94a3b8] hover:text-red-400 tap-btn">
                    ${icon('trash2', 'w-4 h-4')}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Add Member Input -->
        <form id="form-add-member" class="pt-2 border-t border-[#1f2433] flex gap-2">
          <input
            id="new-member-name"
            type="text"
            required
            placeholder="New member name"
            class="flex-1 min-w-0 bg-[#0c0e14] border border-[#1e2332] focus:border-sky-400 rounded-xl px-3 py-2 text-xs text-white outline-none"
          />
          <input
            id="new-member-role"
            type="text"
            placeholder="Instrument"
            class="flex-1 min-w-0 bg-[#0c0e14] border border-[#1e2332] focus:border-sky-400 rounded-xl px-3 py-2 text-xs text-white outline-none"
          />
          <button
            type="submit"
            class="px-3.5 py-2 bg-[#1b2130] hover:bg-[#252c3d] text-white rounded-xl text-xs font-bold tap-btn flex-shrink-0 flex items-center gap-1 border border-[#2b354c]"
          >
            ${icon('plus', 'w-3.5 h-3.5')}
            <span>Add</span>
          </button>
        </form>

        <!-- Sheet Footer -->
        <div class="flex items-center justify-between pt-3 border-t border-[#1f2433]">
          <button id="btn-reset-defaults" class="text-xs text-[#94a3b8] hover:text-red-400 tap-btn">
            Reset Defaults
          </button>
          <button id="sheet-btn-done" class="px-5 py-2.5 bg-[#d4d9e1] hover:bg-[#c3c9d4] text-[#0b0e14] font-bold text-xs rounded-xl tap-btn">
            Done
          </button>
        </div>

      </div>
    </div>
  `;
}

/**
 * Mobile Bottom Sheet: Firebase Cloud Sync Setup
 */
function renderCloudSheet() {
  const activeUrl = getActiveFirebaseUrl();
  const isConnected = state.cloudStatus === 'connected';

  return `
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
      <div class="modal-sheet w-full max-w-lg mx-auto bg-[#11141c] border-t border-[#1f2433] rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        
        <div class="w-10 h-1 bg-[#283042] rounded-full mx-auto"></div>

        <div class="flex items-center justify-between pb-2 border-b border-[#1f2433]">
          <div class="flex items-center gap-2">
            <h3 class="font-bold text-white text-base">Firebase Realtime Sync</h3>
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
              isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-amber-500/10 text-amber-400 border border-amber-500/25'
            }">
              <span class="w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}"></span>
              <span>${isConnected ? 'Connected' : 'Not Connected'}</span>
            </span>
          </div>
          <button id="modal-close" class="p-1 text-[#94a3b8] hover:text-white tap-btn">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <p class="text-xs text-[#94a3b8] leading-relaxed">
          Connect your free <strong>Google Firebase Realtime Database</strong> so whenever anyone marks paid, every band member's phone updates automatically in real-time.
        </p>

        <!-- Database URL Input -->
        <div class="space-y-1.5">
          <label class="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider font-mono block">Firebase Database URL</label>
          <input
            id="sheet-firebase-url-input"
            type="url"
            value="${escapeHtml(activeUrl)}"
            placeholder="https://your-band-default-rtdb.firebaseio.com"
            class="w-full bg-[#0c0e14] border border-[#1e2332] focus:border-sky-400 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none font-mono"
          />
        </div>

        <div class="flex gap-2">
          <button
            id="btn-test-connect-firebase"
            class="flex-1 py-3 px-4 bg-[#d4d9e1] hover:bg-[#c3c9d4] text-[#0b0e14] font-bold text-xs rounded-xl tap-btn"
          >
            Connect & Save
          </button>
          ${activeUrl ? `
            <button
              id="btn-disconnect-firebase"
              class="py-3 px-4 bg-[#181d28] hover:bg-[#232938] text-red-400 font-bold text-xs rounded-xl tap-btn border border-[#2b354c]"
            >
              Disconnect
            </button>
          ` : ''}
        </div>

        <!-- 3-Step Setup Guide -->
        <div class="p-3.5 rounded-2xl bg-[#0c0e14] border border-[#1c2130] space-y-2 text-xs">
          <span class="font-bold text-white block">Quick 2-Minute Free Setup:</span>
          <ol class="list-decimal list-inside space-y-1 text-[#94a3b8] leading-relaxed">
            <li>Go to <a href="https://console.firebase.google.com" target="_blank" class="text-sky-400 underline">console.firebase.google.com</a> (100% free, no credit card).</li>
            <li>Click <strong>Add Project</strong>, name it (e.g. <em>our-band-tracker</em>).</li>
            <li>Click <strong>Build ➔ Realtime Database ➔ Create Database</strong>.</li>
            <li>Select <strong>Start in test mode</strong> (or set Rules to: <code class="font-mono text-white text-[10px] bg-[#141824] px-1 py-0.5 rounded">{".read": true, ".write": true}</code>).</li>
            <li>Copy the database URL and paste it in the box above!</li>
          </ol>
        </div>

      </div>
    </div>
  `;
}

/**
 * Mobile Bottom Sheet: Statistics
 */
function renderStatsSheet() {
  const stats = getMemberStats();
  const total = state.history.length;

  return `
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
      <div class="modal-sheet w-full max-w-lg mx-auto bg-[#11141c] border-t border-[#1f2433] rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        
        <div class="w-10 h-1 bg-[#283042] rounded-full mx-auto"></div>

        <div class="flex items-center justify-between pb-2 border-b border-[#1f2433]">
          <h3 class="font-bold text-white text-base">Payment Fair-Share Stats</h3>
          <button id="modal-close" class="p-1 text-[#94a3b8] hover:text-white tap-btn">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <div class="p-3.5 rounded-xl bg-[#0c0e14] border border-[#1c2130] flex justify-between items-center text-xs">
          <span class="text-[#94a3b8] font-medium">Total Sessions Logged</span>
          <span class="text-xl font-bold text-white font-mono">${total}</span>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-semibold text-[#94a3b8] uppercase tracking-wider font-mono block">Payments Per Member</span>
          <div class="space-y-2 max-h-56 overflow-y-auto">
            ${Object.entries(stats).map(([name, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return `
                <div class="p-2.5 rounded-xl bg-[#0c0e14] border border-[#1c2130] space-y-1.5 text-xs">
                  <div class="flex justify-between items-center">
                    <span class="font-bold text-white">${escapeHtml(name)}</span>
                    <span class="font-mono text-sky-400 font-bold">${count} paid (${pct}%)</span>
                  </div>
                  <div class="w-full bg-[#181d28] rounded-full h-1 overflow-hidden">
                    <div class="bg-sky-400 h-1 rounded-full" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <button id="sheet-btn-done" class="w-full py-2.5 bg-[#181d28] hover:bg-[#232938] text-white font-bold text-xs rounded-xl tap-btn border border-[#2b354c]">
          Close
        </button>

      </div>
    </div>
  `;
}

/**
 * Event Listeners
 */
function attachEventListeners() {
  // Sound Mute Toggle
  const soundBtn = document.getElementById('btn-sound-toggle');
  if (soundBtn) {
    soundBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      saveState(true);
      render();
    });
  }

  // Primary Action: Mark Paid
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
      if (e.key === 'Enter') advanceQueue(noteInput.value);
    });
  }

  // Swap / Skip Turn
  const swapBtn = document.getElementById('btn-swap-turn');
  if (swapBtn) swapBtn.addEventListener('click', swapTurn);

  // Undo button on hero
  const heroUndoBtn = document.getElementById('btn-hero-undo');
  if (heroUndoBtn) heroUndoBtn.addEventListener('click', undoLastAction);

  // Clear History
  const clearHistoryBtn = document.getElementById('btn-clear-history');
  if (clearHistoryBtn) clearHistoryBtn.addEventListener('click', clearHistory);

  // Delete Individual History Entry
  document.querySelectorAll('[data-delete-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-delete-id');
      deleteHistoryEntry(id);
    });
  });

  // Open Modal triggers
  const rosterBtn = document.getElementById('btn-open-roster');
  const rosterLink = document.getElementById('btn-edit-roster-link');
  [rosterBtn, rosterLink].forEach(b => {
    if (b) b.addEventListener('click', () => { state.activeModal = 'roster'; render(); });
  });

  const cloudStatusBtn = document.getElementById('header-btn-cloud-status');
  const cloudBannerBtn = document.getElementById('btn-banner-cloud-setup');
  const footerCloudBtn = document.getElementById('footer-btn-cloud');
  [cloudStatusBtn, cloudBannerBtn, footerCloudBtn].forEach(b => {
    if (b) b.addEventListener('click', () => { state.activeModal = 'cloud'; render(); });
  });

  const statsBtn = document.getElementById('btn-open-stats');
  const footerStatsBtn = document.getElementById('footer-btn-stats');
  [statsBtn, footerStatsBtn].forEach(b => {
    if (b) b.addEventListener('click', () => { state.activeModal = 'stats'; render(); });
  });

  // Export JSON Backup
  const footerExportBtn = document.getElementById('footer-btn-export');
  if (footerExportBtn) footerExportBtn.addEventListener('click', exportBackupJson);

  // Modal Close buttons
  const modalCloseBtn = document.getElementById('modal-close');
  const sheetDoneBtn = document.getElementById('sheet-btn-done');
  [modalCloseBtn, sheetDoneBtn].forEach(b => {
    if (b) b.addEventListener('click', () => { state.activeModal = null; render(); });
  });

  // Roster Modal Listeners
  if (state.activeModal === 'roster') {
    const bandNameInput = document.getElementById('sheet-band-name');
    if (bandNameInput) {
      bandNameInput.addEventListener('input', (e) => {
        state.bandName = e.target.value.trim() || DEFAULT_BAND_NAME;
        saveState();
      });
    }

    // Member inline editing
    document.querySelectorAll('[data-idx]').forEach(input => {
      input.addEventListener('input', (e) => {
        const idx = parseInt(input.getAttribute('data-idx'), 10);
        const field = input.getAttribute('data-field');
        if (state.queue[idx]) {
          state.queue[idx][field] = e.target.value;
          saveState();
        }
      });
    });

    // Move Up
    document.querySelectorAll('[data-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-up'), 10);
        if (idx > 0) {
          const item = state.queue.splice(idx, 1)[0];
          state.queue.splice(idx - 1, 0, item);
          saveState();
          render();
        }
      });
    });

    // Move Down
    document.querySelectorAll('[data-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-down'), 10);
        if (idx < state.queue.length - 1) {
          const item = state.queue.splice(idx, 1)[0];
          state.queue.splice(idx + 1, 0, item);
          saveState();
          render();
        }
      });
    });

    // Delete Member
    document.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-del'), 10);
        if (state.queue.length <= 1) {
          alert('You must have at least one member.');
          return;
        }
        const m = state.queue[idx];
        if (window.confirm(`Remove ${m.name}?`)) {
          state.queue.splice(idx, 1);
          saveState();
          render();
        }
      });
    });

    // Add Member Form
    const addForm = document.getElementById('form-add-member');
    if (addForm) {
      addForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('new-member-name');
        const roleInput = document.getElementById('new-member-role');
        const name = nameInput.value.trim();
        const role = roleInput.value.trim() || 'Band Member';

        if (name) {
          state.queue.push({ id: 'm_' + Date.now(), name, role });
          saveState();
          nameInput.value = '';
          roleInput.value = '';
          render();
        }
      });
    }

    // Reset Defaults
    const resetBtn = document.getElementById('btn-reset-defaults');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (window.confirm('Reset roster to defaults?')) {
          state.queue = [...DEFAULT_MEMBERS];
          state.bandName = DEFAULT_BAND_NAME;
          saveState();
          render();
        }
      });
    }
  }

  // Cloud Sync Modal Listeners
  if (state.activeModal === 'cloud') {
    const connectBtn = document.getElementById('btn-test-connect-firebase');
    const input = document.getElementById('sheet-firebase-url-input');
    if (connectBtn && input) {
      connectBtn.addEventListener('click', async () => {
        const rawUrl = input.value.trim();
        if (!rawUrl) {
          alert('Please enter your Firebase Database URL.');
          return;
        }

        connectBtn.textContent = 'Connecting...';
        state.firebaseUrl = rawUrl;
        localStorage.setItem('band_firebase_url', rawUrl);

        const success = await fetchFromCloud();
        if (success) {
          initRealtimeLiveSync();
          showToast('Connected to Firebase! Live auto-sync active.');
          state.activeModal = null;
        } else {
          showToast('Connection failed. Please check the URL and rules.');
        }
        render();
      });
    }

    const disconnectBtn = document.getElementById('btn-disconnect-firebase');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', () => {
        if (window.confirm('Disconnect Firebase cloud sync and use local mode?')) {
          state.firebaseUrl = '';
          localStorage.removeItem('band_firebase_url');
          if (cloudEventSource) {
            cloudEventSource.close();
            cloudEventSource = null;
          }
          state.cloudStatus = 'unconfigured';
          showToast('Disconnected from Firebase.');
          render();
        }
      });
    }
  }
}

/**
 * Backup Export
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
 * Escape HTML
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
 * Service Worker
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

// Initial Boot
window.addEventListener('DOMContentLoaded', async () => {
  loadState();
  render();
  registerServiceWorker();

  const activeUrl = getActiveFirebaseUrl();
  if (activeUrl) {
    await fetchFromCloud();
    initRealtimeLiveSync();
  }
});
