/**
 * Band Rehearsal Tracker - Modern Obsidian & Slate Edition
 * Permanent Firebase Cloud Storage Integration
 */

// Permanent hardcoded Firebase Realtime Database URL (from src/config.js or fallback)
const activeDbUrl = (typeof FIREBASE_DB_URL !== 'undefined' ? FIREBASE_DB_URL : "https://rehearsal-tracker-cc229-default-rtdb.europe-west1.firebasedatabase.app").replace(/\/+$/, '');

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
  activeModal: null // 'roster' | 'stats' | null
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
 * Storage & Cloud Helpers
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
    console.error('Failed to load local state:', e);
  }
}

function saveState(skipCloud = false) {
  try {
    localStorage.setItem('band_pay_queue', JSON.stringify(state.queue));
    localStorage.setItem('band_pay_history', JSON.stringify(state.history));
    localStorage.setItem('band_pay_name', state.bandName);
    localStorage.setItem('band_pay_sound', String(state.soundEnabled));

    if (!skipCloud) {
      syncToCloud();
    }
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

/**
 * Send state to Firebase Realtime Database
 */
async function syncToCloud() {
  if (!activeDbUrl) return;
  try {
    const payload = {
      bandName: state.bandName,
      queue: state.queue,
      history: state.history.slice(0, 50),
      updatedAt: Date.now()
    };

    await fetch(`${activeDbUrl}/rehearsal.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Firebase sync error:', err);
  }
}

/**
 * Fetch latest state from Firebase Realtime Database
 */
async function fetchFromCloud() {
  if (!activeDbUrl) return false;
  try {
    const res = await fetch(`${activeDbUrl}/rehearsal.json`);
    if (!res.ok) return false;

    const data = await res.json();
    if (data && Array.isArray(data.queue) && data.queue.length > 0) {
      state.queue = data.queue;
      if (data.bandName) state.bandName = data.bandName;
      if (Array.isArray(data.history)) state.history = data.history;
      saveState(true);
      if (!state.activeModal) {
        render();
      }
      return true;
    }
  } catch (err) {
    console.warn('Failed to fetch from Firebase:', err);
  }
  return false;
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

  app.innerHTML = `
    <!-- Top Modern Header (Two-Row Layout for Full Band Name & Thumb Ergonomics) -->
    <header class="py-3 border-b border-[#1f2433] space-y-2">
      <!-- Row 1: Full Band Name (Unclipped, full width, word-wrap) -->
      <div class="flex items-center justify-between gap-2">
        <h1 class="text-xl sm:text-2xl font-black text-white leading-tight break-words flex-1 tracking-tight">
          ${escapeHtml(state.bandName)}
        </h1>
      </div>

      <!-- Row 2: Rotation count + Quick action buttons -->
      <div class="flex items-center justify-between gap-2 pt-0.5">
        <div class="flex items-center gap-1.5 font-mono text-[11px] text-[#818ea3] min-w-0">
          <span class="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0"></span>
          <span class="truncate">${state.queue.length} in rotation</span>
        </div>

        <div class="flex items-center space-x-1.5 flex-shrink-0">
          <button 
            id="btn-sound-toggle"
            title="${state.soundEnabled ? 'Mute click sound' : 'Unmute click sound'}"
            class="w-7 h-7 flex items-center justify-center rounded-lg bg-[#141824] border border-[#23293a] text-[#94a3b8] hover:text-white tap-btn"
          >
            ${icon(state.soundEnabled ? 'volume2' : 'volumeX', 'w-3.5 h-3.5')}
          </button>

          <button 
            id="btn-open-stats"
            title="Payment Fair-Share Stats"
            class="px-2 h-7 flex items-center justify-center gap-1 rounded-lg bg-[#141824] border border-[#23293a] text-[#94a3b8] hover:text-white tap-btn text-[11px] font-medium"
          >
            ${icon('barChart', 'w-3.5 h-3.5')}
            <span>Stats</span>
          </button>

          <button 
            id="btn-open-roster"
            title="Roster & Band Settings"
            class="px-2.5 h-7 flex items-center justify-center gap-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-400 hover:text-sky-300 tap-btn text-[11px] font-semibold"
          >
            ${icon('settings', 'w-3.5 h-3.5')}
            <span>Roster</span>
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="py-4 pb-20 space-y-5">

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

    <!-- MOBILE BOTTOM SHEETS -->
    ${state.activeModal === 'roster' ? renderRosterSheet() : ''}
    ${state.activeModal === 'stats' ? renderStatsSheet() : ''}
  `;

  attachEventListeners();
}

/**
 * Mobile Bottom Sheet: Roster & Band Settings (Pure Uncontrolled Inputs)
 */
function renderRosterSheet() {
  return `
    <div id="modal-backdrop" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
      <div class="modal-sheet w-full max-w-lg mx-auto bg-[#11141c] border-t border-[#1f2433] rounded-t-3xl p-5 space-y-4 max-h-[88vh] overflow-y-auto overscroll-contain pb-8">
        
        <!-- Sheet Drag Handle -->
        <div class="w-10 h-1 bg-[#283042] rounded-full mx-auto"></div>

        <div class="flex items-center justify-between pb-2 border-b border-[#1f2433]">
          <div>
            <h3 class="font-bold text-white text-base">Band & Roster Settings</h3>
            <p class="text-xs text-[#94a3b8]">Edit names, roles, or order, then tap Save Changes.</p>
          </div>
          <button id="modal-close" class="p-1.5 text-[#94a3b8] hover:text-white tap-btn">
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

          <div class="space-y-2">
            ${state.queue.map((m, idx) => `
              <div class="flex items-center space-x-2 bg-[#0c0e14] p-2 rounded-xl border border-[#1c2130]">
                <span class="font-mono text-xs font-bold text-[#64748b] w-5 text-center flex-shrink-0">
                  ${idx + 1}
                </span>

                <input
                  type="text"
                  data-idx="${idx}"
                  value="${escapeHtml(m.name)}"
                  placeholder="Name"
                  class="roster-name-input flex-1 min-w-0 bg-[#141824] border border-[#23293a] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-400"
                />

                <input
                  type="text"
                  data-idx="${idx}"
                  value="${escapeHtml(m.role || '')}"
                  placeholder="Instrument"
                  class="roster-role-input flex-1 min-w-0 bg-[#141824] border border-[#23293a] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-sky-400"
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
          <div class="flex items-center gap-2">
            <button id="sheet-btn-cancel" class="px-3 py-2 text-xs text-[#94a3b8] hover:text-white font-medium tap-btn">
              Cancel
            </button>
            <button id="sheet-btn-save" class="px-5 py-2.5 bg-[#d4d9e1] hover:bg-[#c3c9d4] text-[#0b0e14] font-bold text-xs rounded-xl tap-btn">
              Save Changes
            </button>
          </div>
        </div>

      </div>
    </div>
  `;
}

/**
 * Mobile Bottom Sheet: Payment Fair-Share Stats
 */
function renderStatsSheet() {
  const stats = getMemberStats();
  const total = state.history.length;

  return `
    <div id="modal-backdrop" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col justify-end">
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
                    <span class="font-mono text-[#94a3b8]">${count} paid <span class="text-[#64748b]">(${pct}%)</span></span>
                  </div>
                  <div class="w-full bg-[#161a26] rounded-full h-1.5 overflow-hidden">
                    <div class="bg-sky-400 h-1.5 rounded-full transition-all" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <button id="modal-close" class="w-full py-3 bg-[#161a26] hover:bg-[#1d2232] text-white font-bold text-xs rounded-xl tap-btn border border-[#273044]">
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

  const statsBtn = document.getElementById('btn-open-stats');
  if (statsBtn) {
    statsBtn.addEventListener('click', () => { state.activeModal = 'stats'; render(); });
  }

  // Generic modal backdrop / close buttons for non-roster sheets
  if (state.activeModal === 'stats') {
    const modalBackdrop = document.getElementById('modal-backdrop');
    document.querySelectorAll('#modal-close').forEach(btn => {
      btn.addEventListener('click', () => { state.activeModal = null; render(); });
    });
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) { state.activeModal = null; render(); }
      });
    }
  }

  // ROSTER MODAL (Clean, simple, no typing listeners)
  if (state.activeModal === 'roster') {
    // Reads current DOM input values into state without saving to cloud yet
    function readRosterInputsIntoState() {
      const bandNameInput = document.getElementById('sheet-band-name');
      if (bandNameInput && bandNameInput.value.trim()) {
        state.bandName = bandNameInput.value.trim();
      }

      document.querySelectorAll('.roster-name-input').forEach(input => {
        const idx = parseInt(input.getAttribute('data-idx'), 10);
        if (state.queue[idx]) {
          const val = input.value.trim();
          if (val) state.queue[idx].name = val;
        }
      });

      document.querySelectorAll('.roster-role-input').forEach(input => {
        const idx = parseInt(input.getAttribute('data-idx'), 10);
        if (state.queue[idx]) {
          state.queue[idx].role = input.value.trim();
        }
      });
    }

    // Save Changes button: sends to Firebase DB and saves locally
    const saveBtn = document.getElementById('sheet-btn-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        readRosterInputsIntoState();
        state.activeModal = null;
        saveState(); // Saves locally AND pushes to Firebase DB
        render();
        showToast('Roster saved to database!');
      });
    }

    // Cancel / Close buttons: discard uncommitted modal changes
    const cancelBtn = document.getElementById('sheet-btn-cancel');
    const modalCloseBtn = document.getElementById('modal-close');
    const modalBackdrop = document.getElementById('modal-backdrop');
    [cancelBtn, modalCloseBtn, modalBackdrop].forEach(b => {
      if (b) {
        b.addEventListener('click', (e) => {
          if (b === modalBackdrop && e.target !== modalBackdrop) return;
          state.activeModal = null;
          render();
        });
      }
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
          readRosterInputsIntoState();
          state.queue.push({ id: 'm_' + Date.now(), name, role });
          render();
        }
      });
    }

    // Move Up
    document.querySelectorAll('[data-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-up'), 10);
        if (idx > 0) {
          readRosterInputsIntoState();
          const item = state.queue.splice(idx, 1)[0];
          state.queue.splice(idx - 1, 0, item);
          render();
        }
      });
    });

    // Move Down
    document.querySelectorAll('[data-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-down'), 10);
        if (idx < state.queue.length - 1) {
          readRosterInputsIntoState();
          const item = state.queue.splice(idx, 1)[0];
          state.queue.splice(idx + 1, 0, item);
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
        readRosterInputsIntoState();
        const m = state.queue[idx];
        if (window.confirm(`Remove ${m.name}?`)) {
          state.queue.splice(idx, 1);
          render();
        }
      });
    });

    // Reset Defaults
    const resetBtn = document.getElementById('btn-reset-defaults');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (window.confirm('Reset roster to default band members?')) {
          state.queue = [...DEFAULT_MEMBERS];
          state.bandName = DEFAULT_BAND_NAME;
          render();
        }
      });
    }
  }
}

/**
 * Utility: HTML Escaper to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * PWA Service Worker Registration
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

// Initial Boot
function initApp() {
  loadState();
  render();
  registerServiceWorker();

  // Load latest state from Firebase once on startup
  fetchFromCloud();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Quietly check for fresh data when switching back to the browser tab
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !state.activeModal) {
    fetchFromCloud();
  }
});
