/**
 * Band Rehearsal Tracker - Lean Mobile-First Core
 * Engineered for phone use, zero dependencies, offline capable.
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
  activeModal: null, // 'roster' | 'share' | 'stats' | null
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
 * Lean, tactile audio click/chime on action.
 */
function playTactileFeedback() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Clean, modern acoustic woodblock / tactile click
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.04);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
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
    console.error('Failed to load state:', e);
  }
}

function saveState() {
  try {
    localStorage.setItem('band_pay_queue', JSON.stringify(state.queue));
    localStorage.setItem('band_pay_history', JSON.stringify(state.history));
    localStorage.setItem('band_pay_name', state.bandName);
    localStorage.setItem('band_pay_sound', String(state.soundEnabled));
  } catch (e) {
    console.error('Failed to save state:', e);
  }
}

/**
 * Mobile-friendly Toast Alert
 */
let toastTimer = null;
function showToast(message, actionText = null, onAction = null, duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  if (toastTimer) clearTimeout(toastTimer);

  container.innerHTML = `
    <div class="bg-[#1c1f24] border border-[#2f3540] text-[#f4f4f6] px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-sm toast-anim">
      <span class="font-medium truncate">${message}</span>
      ${actionText ? `
        <button id="toast-action-btn" class="flex-shrink-0 text-xs font-bold bg-[#d2f83c] hover:bg-[#bfe628] text-black px-3 py-1.5 rounded-xl tap-btn">
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
 * Band Sync Payload & Link
 */
function createSyncPayload() {
  const payload = {
    bandName: state.bandName,
    queue: state.queue,
    history: state.history.slice(0, 25),
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
    console.error('Failed to parse sync payload:', e);
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

  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname);
  }

  showToast('Synced queue with band link!', 'Undo', undoLastAction);
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
 * Mobile Native Share
 */
async function shareBandUpdate() {
  const currentPayer = state.queue[0]?.name || 'Someone';
  const nextPayer = state.queue[1]?.name || 'Someone';
  const url = getSyncUrl();
  const title = `${state.bandName} Rehearsal Tracker`;
  const text = `${state.bandName} update: ${currentPayer} is paying next rehearsal (followed by ${nextPayer}). Sync here:`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Share error, fallback to copy:', err);
      } else {
        return;
      }
    }
  }

  // Fallback to clipboard
  try {
    await navigator.clipboard.writeText(url);
    showToast('Sync link copied! Paste in group chat.');
  } catch (e) {
    prompt('Copy sync link:', url);
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
 * Core Render Loop (Mobile-First Layout)
 */
function render() {
  const app = document.getElementById('root');
  if (!app) return;

  const currentPayer = state.queue[0] || { name: 'No Members', role: 'Tap Roster to add' };
  const nextPayer = state.queue[1] || (state.queue[0] ? { name: state.queue[0].name, role: 'Only 1 member' } : { name: '-', role: '' });
  const hasUndo = state.undoStack.length > 0;

  app.innerHTML = `
    <!-- Top Mobile Header -->
    <header class="py-3 flex items-center justify-between border-b border-[#24272d] gap-2">
      <div class="flex items-center space-x-2.5 min-w-0 flex-1">
        <div class="w-8 h-8 rounded-lg bg-[#191c20] border border-[#24272d] flex items-center justify-center text-[#d2f83c] flex-shrink-0">
          ${icon('music', 'w-4 h-4')}
        </div>
        <div class="min-w-0 flex-1">
          <h1 class="text-base font-bold text-white truncate leading-tight">${escapeHtml(state.bandName)}</h1>
          <p class="text-[11px] text-[#8b929e] truncate">${state.queue.length} in rotation</p>
        </div>
      </div>

      <div class="flex items-center space-x-0.5 flex-shrink-0">
        <button 
          id="btn-sound-toggle"
          title="${state.soundEnabled ? 'Mute' : 'Unmute'}"
          class="w-8 h-8 flex items-center justify-center text-[#8b929e] hover:text-white rounded-lg hover:bg-[#191c20] tap-btn"
        >
          ${icon(state.soundEnabled ? 'volume2' : 'volumeX', 'w-4 h-4')}
        </button>

        <button 
          id="btn-open-stats"
          title="Payment Stats"
          class="w-8 h-8 flex items-center justify-center text-[#8b929e] hover:text-white rounded-lg hover:bg-[#191c20] tap-btn"
        >
          ${icon('barChart', 'w-4 h-4')}
        </button>

        <button 
          id="btn-open-share"
          title="Share Link"
          class="w-8 h-8 flex items-center justify-center text-[#8b929e] hover:text-white rounded-lg hover:bg-[#191c20] tap-btn"
        >
          ${icon('share2', 'w-4 h-4')}
        </button>

        <button 
          id="btn-open-roster"
          title="Roster Settings"
          class="w-8 h-8 flex items-center justify-center text-[#8b929e] hover:text-white rounded-lg hover:bg-[#191c20] tap-btn"
        >
          ${icon('settings', 'w-4 h-4')}
        </button>
      </div>
    </header>

    <!-- Main Mobile Content -->
    <main class="py-4 space-y-4 flex-grow">

      <!-- Incoming Band Update Banner -->
      ${state.pendingSyncData ? `
        <div class="lean-card p-3.5 bg-[#141619] border-[#d2f83c]/50 flex items-center justify-between gap-3">
          <div class="min-w-0 text-xs flex-1">
            <span class="font-bold text-[#d2f83c] block">New Band Sync Available</span>
            <span class="text-[#8b929e] truncate block">Next to pay: <strong>${escapeHtml(state.pendingSyncData.queue[0]?.name || 'N/A')}</strong></span>
          </div>
          <div class="flex items-center space-x-1.5 flex-shrink-0">
            <button id="btn-sync-dismiss" class="px-2.5 py-1 text-xs text-[#8b929e] hover:text-white tap-btn">Dismiss</button>
            <button id="btn-sync-apply" class="px-3 py-1 text-xs font-bold bg-[#d2f83c] text-black rounded-lg tap-btn">Apply</button>
          </div>
        </div>
      ` : ''}

      <!-- HERO: WHO PAYS NEXT (Lean & High-Contrast) -->
      <section class="lean-card p-4 sm:p-5 space-y-4">
        
        <!-- Header row on card: Label & Quick Actions -->
        <div class="flex items-center justify-between gap-2">
          <span class="badge-pill px-2.5 py-1 rounded-md bg-[#1d2026] text-[#8b929e] border border-[#2b303a] flex-shrink-0">
            #01 • NEXT REHEARSAL
          </span>
          
          <div class="flex items-center gap-2 flex-shrink-0">
            ${state.queue.length > 1 ? `
              <button id="btn-swap-turn" class="text-xs font-semibold text-[#8b929e] hover:text-white flex items-center gap-1 tap-btn">
                ${icon('swap', 'w-3.5 h-3.5')}
                <span>Swap turn</span>
              </button>
            ` : ''}

            ${hasUndo ? `
              <button id="btn-hero-undo" class="text-xs font-semibold text-[#8b929e] hover:text-white flex items-center gap-1 tap-btn">
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
          <div class="text-sm font-medium text-[#8b929e] mt-1.5 truncate">
            ${escapeHtml(currentPayer.role || 'Band Member')}
          </div>
        </div>

        <!-- Up Next Preview Row -->
        <div class="flex items-center justify-between py-2 px-3 rounded-xl bg-[#0b0c0e] border border-[#20232a] text-xs gap-2">
          <span class="text-[#8b929e] font-medium flex-shrink-0">Up next afterwards:</span>
          <span class="font-bold text-white truncate text-right">
            ${escapeHtml(nextPayer.name)} <span class="text-[#8b929e] font-normal">(${escapeHtml(nextPayer.role || '')})</span>
          </span>
        </div>

        <!-- Optional Session Note Input -->
        <div>
          <input
            id="cost-note-input"
            type="text"
            placeholder="Add note (e.g. $50 @ Soundstage)"
            class="w-full bg-[#0b0c0e] border border-[#24272d] focus:border-[#d2f83c] rounded-xl px-3.5 py-3 text-sm text-white placeholder-[#5a6270] outline-none"
          />
        </div>

        <!-- PRIMARY ACTION: Thumb-friendly Mark Paid Button -->
        <button
          id="btn-mark-paid"
          class="w-full min-h-[52px] py-3.5 px-4 bg-[#d2f83c] hover:bg-[#bfe628] text-black font-extrabold text-sm sm:text-base rounded-xl flex items-center justify-center gap-1.5 tap-btn shadow-sm leading-tight text-center flex-wrap"
        >
          <span>${escapeHtml(currentPayer.name)} Paid</span>
          <span class="opacity-60">•</span>
          <span>Rotate to ${escapeHtml(nextPayer.name)}</span>
          ${icon('arrowRight', 'w-4 h-4')}
        </button>

      </section>

      <!-- ROTATION QUEUE LIST (Lean Mobile Vertical List) -->
      <section class="space-y-2">
        <div class="flex items-center justify-between px-1">
          <span class="text-xs font-bold text-[#8b929e] uppercase tracking-wider">Rotation Queue</span>
          <button id="btn-edit-roster-link" class="text-xs text-[#d2f83c] hover:underline font-semibold tap-btn">
            Edit Roster
          </button>
        </div>

        <div class="space-y-1.5">
          ${state.queue.map((member, idx) => {
            const isFirst = idx === 0;
            const isSecond = idx === 1;
            return `
              <div class="flex items-center justify-between p-3 rounded-xl border gap-2 ${
                isFirst 
                  ? 'bg-[#141619] border-[#d2f83c]/50 text-white' 
                  : isSecond
                  ? 'bg-[#121417] border-[#2b303a] text-[#f4f4f6]'
                  : 'bg-[#0f1114] border-[#1d2026] text-[#8b929e]'
              }">
                <div class="flex items-center space-x-2.5 min-w-0 flex-1">
                  <span class="font-mono text-xs font-bold w-6 text-center flex-shrink-0 ${isFirst ? 'text-[#d2f83c]' : 'text-[#8b929e]'}">
                    #${idx + 1 < 10 ? '0' + (idx + 1) : idx + 1}
                  </span>
                  <div class="min-w-0 flex-1">
                    <span class="font-bold text-sm text-white truncate block">${escapeHtml(member.name)}</span>
                    <span class="text-xs text-[#8b929e] truncate block">${escapeHtml(member.role || 'Member')}</span>
                  </div>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0">
                  ${isFirst ? `
                    <span class="badge-pill px-2 py-0.5 rounded bg-[#d2f83c]/15 text-[#d2f83c] border border-[#d2f83c]/30">
                      Paying
                    </span>
                  ` : isSecond ? `
                    <span class="badge-pill px-2 py-0.5 rounded bg-[#1f232b] text-[#8b929e]">
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
          <div class="flex items-center space-x-1.5 text-xs font-bold text-[#8b929e] uppercase tracking-wider">
            <span>Payment History</span>
            <span class="text-[#5a6270]">(${state.history.length})</span>
          </div>

          ${state.history.length > 0 ? `
            <button id="btn-clear-history" class="text-xs text-[#8b929e] hover:text-red-400 tap-btn">
              Clear
            </button>
          ` : ''}
        </div>

        ${state.history.length === 0 ? `
          <div class="p-5 rounded-2xl bg-[#141619] border border-[#24272d] text-center text-xs text-[#8b929e]">
            No payment records yet. Tap the button above when someone pays.
          </div>
        ` : `
          <div class="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
            ${state.history.map(item => `
              <div class="flex items-center justify-between p-3 rounded-xl bg-[#141619] border border-[#24272d] text-xs gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="font-bold text-white">${escapeHtml(item.payerName)}</span>
                    ${item.payerRole ? `<span class="text-[#8b929e]">(${escapeHtml(item.payerRole)})</span>` : ''}
                  </div>
                  ${item.note ? `
                    <p class="text-[#d2f83c]/90 mt-0.5 font-medium truncate">${escapeHtml(item.note)}</p>
                  ` : ''}
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0 text-[#8b929e]">
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

    <!-- Lean Mobile Footer -->
    <footer class="py-4 border-t border-[#24272d] text-center text-xs text-[#5a6270] flex items-center justify-center gap-3">
      <button id="footer-btn-share" class="hover:text-white tap-btn">Share Link</button>
      <span>•</span>
      <button id="footer-btn-stats" class="hover:text-white tap-btn">Stats</button>
      <span>•</span>
      <button id="footer-btn-export" class="hover:text-white tap-btn">Backup JSON</button>
    </footer>

    <!-- MOBILE BOTTOM SHEETS -->
    ${state.activeModal === 'roster' ? renderRosterSheet() : ''}
    ${state.activeModal === 'share' ? renderShareSheet() : ''}
    ${state.activeModal === 'stats' ? renderStatsSheet() : ''}
  `;

  attachEventListeners();
}

/**
 * Mobile Bottom Sheet: Roster & Band Settings
 */
function renderRosterSheet() {
  return `
    <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end">
      <div class="modal-sheet w-full max-w-lg mx-auto bg-[#141619] border-t border-[#24272d] rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        
        <!-- Sheet Drag Handle -->
        <div class="w-10 h-1 bg-[#2e333d] rounded-full mx-auto"></div>

        <div class="flex items-center justify-between pb-2 border-b border-[#24272d]">
          <h3 class="font-extrabold text-white text-base">Band & Roster Settings</h3>
          <button id="modal-close" class="p-1 text-[#8b929e] hover:text-white tap-btn">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <!-- Band Name Field -->
        <div class="space-y-1">
          <label class="text-[11px] font-bold text-[#8b929e] uppercase tracking-wider block">Band Name</label>
          <input
            id="sheet-band-name"
            type="text"
            value="${escapeHtml(state.bandName)}"
            class="w-full bg-[#0b0c0e] border border-[#24272d] focus:border-[#d2f83c] rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
          />
        </div>

        <!-- Roster Queue Management -->
        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs text-[#8b929e]">
            <span class="font-bold uppercase tracking-wider">Queue Order (Top pays first)</span>
            <span>${state.queue.length} members</span>
          </div>

          <div class="space-y-2 max-h-56 overflow-y-auto pr-0.5">
            ${state.queue.map((m, idx) => `
              <div class="flex items-center space-x-2 bg-[#0b0c0e] p-2 rounded-xl border border-[#20232a]">
                <span class="font-mono text-xs font-bold text-[#8b929e] w-5 text-center flex-shrink-0">
                  ${idx + 1}
                </span>

                <input
                  type="text"
                  data-idx="${idx}"
                  data-field="name"
                  value="${escapeHtml(m.name)}"
                  placeholder="Name"
                  class="flex-1 min-w-0 bg-[#141619] border border-[#24272d] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#d2f83c]"
                />

                <input
                  type="text"
                  data-idx="${idx}"
                  data-field="role"
                  value="${escapeHtml(m.role || '')}"
                  placeholder="Instrument"
                  class="flex-1 min-w-0 bg-[#141619] border border-[#24272d] rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#d2f83c]"
                />

                <div class="flex items-center space-x-1 flex-shrink-0">
                  <button data-up="${idx}" title="Move up" class="p-1.5 text-[#8b929e] hover:text-white tap-btn ${idx === 0 ? 'opacity-20' : ''}" ${idx === 0 ? 'disabled' : ''}>
                    ${icon('arrowUp', 'w-4 h-4')}
                  </button>
                  <button data-down="${idx}" title="Move down" class="p-1.5 text-[#8b929e] hover:text-white tap-btn ${idx === state.queue.length - 1 ? 'opacity-20' : ''}" ${idx === state.queue.length - 1 ? 'disabled' : ''}>
                    ${icon('arrowDown', 'w-4 h-4')}
                  </button>
                  <button data-del="${idx}" title="Remove" class="p-1.5 text-[#8b929e] hover:text-red-400 tap-btn">
                    ${icon('trash2', 'w-4 h-4')}
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Add Member Input -->
        <form id="form-add-member" class="pt-2 border-t border-[#24272d] flex gap-2">
          <input
            id="new-member-name"
            type="text"
            required
            placeholder="New member name"
            class="flex-1 min-w-0 bg-[#0b0c0e] border border-[#24272d] focus:border-[#d2f83c] rounded-xl px-3 py-2 text-xs text-white outline-none"
          />
          <input
            id="new-member-role"
            type="text"
            placeholder="Instrument"
            class="flex-1 min-w-0 bg-[#0b0c0e] border border-[#24272d] focus:border-[#d2f83c] rounded-xl px-3 py-2 text-xs text-white outline-none"
          />
          <button
            type="submit"
            class="px-3.5 py-2 bg-[#1f232b] hover:bg-[#2a303a] text-white rounded-xl text-xs font-bold tap-btn flex-shrink-0 flex items-center gap-1"
          >
            ${icon('plus', 'w-3.5 h-3.5')}
            <span>Add</span>
          </button>
        </form>

        <!-- Sheet Footer -->
        <div class="flex items-center justify-between pt-3 border-t border-[#24272d]">
          <button id="btn-reset-defaults" class="text-xs text-[#8b929e] hover:text-red-400 tap-btn">
            Reset Defaults
          </button>
          <button id="sheet-btn-done" class="px-5 py-2.5 bg-[#d2f83c] text-black font-extrabold text-xs rounded-xl tap-btn">
            Done
          </button>
        </div>

      </div>
    </div>
  `;
}

/**
 * Mobile Bottom Sheet: Share to Band Chat
 */
function renderShareSheet() {
  const syncUrl = getSyncUrl();
  const currentPayer = state.queue[0]?.name || 'N/A';

  return `
    <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end">
      <div class="modal-sheet w-full max-w-lg mx-auto bg-[#141619] border-t border-[#24272d] rounded-t-3xl p-5 space-y-4">
        
        <div class="w-10 h-1 bg-[#2e333d] rounded-full mx-auto"></div>

        <div class="flex items-center justify-between pb-2 border-b border-[#24272d]">
          <h3 class="font-extrabold text-white text-base">Share with Band</h3>
          <button id="modal-close" class="p-1 text-[#8b929e] hover:text-white tap-btn">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <div class="p-3.5 rounded-xl bg-[#0b0c0e] border border-[#20232a] text-xs space-y-1">
          <div class="flex justify-between">
            <span class="text-[#8b929e]">Current payer:</span>
            <span class="font-bold text-[#d2f83c]">${escapeHtml(currentPayer)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-[#8b929e]">Queue members:</span>
            <span class="text-white">${state.queue.length}</span>
          </div>
        </div>

        <!-- 1-Tap Native Share (WhatsApp, iMessage, etc.) -->
        <button
          id="btn-native-share"
          class="w-full h-13 bg-[#d2f83c] hover:bg-[#bfe628] text-black font-extrabold text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 tap-btn"
        >
          ${icon('share2', 'w-4 h-4')}
          <span>Share to WhatsApp / Band Chat</span>
        </button>

        <!-- Direct Copy Link -->
        <div class="space-y-1 pt-1">
          <label class="text-[11px] font-bold text-[#8b929e] uppercase tracking-wider block">Or copy link manually</label>
          <div class="flex items-center space-x-2">
            <input
              id="sheet-sync-input"
              type="text"
              readonly
              value="${escapeHtml(syncUrl)}"
              class="flex-1 min-w-0 bg-[#0b0c0e] border border-[#24272d] rounded-xl px-3 py-2 text-xs text-[#8b929e] outline-none select-all"
            />
            <button
              id="btn-copy-sync-link"
              class="px-3 py-2 bg-[#1f232b] hover:bg-[#2a303a] text-white rounded-xl text-xs font-bold flex items-center gap-1 tap-btn flex-shrink-0"
            >
              ${icon('copy', 'w-3.5 h-3.5')}
              <span>Copy</span>
            </button>
          </div>
        </div>

        <p class="text-[11px] text-[#5a6270] leading-relaxed">
          When band members tap this link on their phones, their tracker prompts to sync in 1 tap without any login.
        </p>

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
    <div class="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end">
      <div class="modal-sheet w-full max-w-lg mx-auto bg-[#141619] border-t border-[#24272d] rounded-t-3xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
        
        <div class="w-10 h-1 bg-[#2e333d] rounded-full mx-auto"></div>

        <div class="flex items-center justify-between pb-2 border-b border-[#24272d]">
          <h3 class="font-extrabold text-white text-base">Payment Fair-Share Stats</h3>
          <button id="modal-close" class="p-1 text-[#8b929e] hover:text-white tap-btn">
            ${icon('x', 'w-5 h-5')}
          </button>
        </div>

        <div class="p-3.5 rounded-xl bg-[#0b0c0e] border border-[#20232a] flex justify-between items-center text-xs">
          <span class="text-[#8b929e] font-semibold">Total Sessions Logged</span>
          <span class="text-xl font-black text-white">${total}</span>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-bold text-[#8b929e] uppercase tracking-wider block">Payments Per Member</span>
          <div class="space-y-2 max-h-56 overflow-y-auto">
            ${Object.entries(stats).map(([name, count]) => {
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return `
                <div class="p-2.5 rounded-xl bg-[#0b0c0e] border border-[#20232a] space-y-1.5 text-xs">
                  <div class="flex justify-between items-center">
                    <span class="font-bold text-white">${escapeHtml(name)}</span>
                    <span class="font-mono text-[#d2f83c] font-bold">${count} paid (${pct}%)</span>
                  </div>
                  <div class="w-full bg-[#191c20] rounded-full h-1 overflow-hidden">
                    <div class="bg-[#d2f83c] h-1 rounded-full" style="width: ${pct}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <button id="sheet-btn-done" class="w-full py-2.5 bg-[#1f232b] hover:bg-[#2a303a] text-white font-bold text-xs rounded-xl tap-btn">
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
      saveState();
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

  const shareBtn = document.getElementById('btn-open-share');
  const footerShareBtn = document.getElementById('footer-btn-share');
  [shareBtn, footerShareBtn].forEach(b => {
    if (b) b.addEventListener('click', () => { state.activeModal = 'share'; render(); });
  });

  const statsBtn = document.getElementById('btn-open-stats');
  const footerStatsBtn = document.getElementById('footer-btn-stats');
  [statsBtn, footerStatsBtn].forEach(b => {
    if (b) b.addEventListener('click', () => { state.activeModal = 'stats'; render(); });
  });

  // Export JSON Backup
  const footerExportBtn = document.getElementById('footer-btn-export');
  if (footerExportBtn) footerExportBtn.addEventListener('click', exportBackupJson);

  // Sync banner actions
  const syncApplyBtn = document.getElementById('btn-sync-apply');
  if (syncApplyBtn) syncApplyBtn.addEventListener('click', applyIncomingSync);

  const syncDismissBtn = document.getElementById('btn-sync-dismiss');
  if (syncDismissBtn) syncDismissBtn.addEventListener('click', dismissIncomingSync);

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

  // Share Modal Listeners
  if (state.activeModal === 'share') {
    const nativeShareBtn = document.getElementById('btn-native-share');
    if (nativeShareBtn) nativeShareBtn.addEventListener('click', shareBandUpdate);

    const copyBtn = document.getElementById('btn-copy-sync-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const url = getSyncUrl();
        try {
          await navigator.clipboard.writeText(url);
          showToast('Sync link copied to clipboard!');
        } catch (e) {
          const input = document.getElementById('sheet-sync-input');
          if (input) {
            input.select();
            document.execCommand('copy');
            showToast('Link copied!');
          }
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
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  checkIncomingSync();
  render();
  registerServiceWorker();

  window.addEventListener('hashchange', () => {
    checkIncomingSync();
    render();
  });
});
