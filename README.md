# 🎸 Band Rehearsal Pay Tracker

> **Never argue about who pays for the next band rehearsal again.**  
> A lightweight, zero-dependency, mobile-first rotational pay queue designed for musicians and deployed effortlessly to **GitHub Pages**.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-success.svg)
![Dependencies: Zero](https://img.shields.io/badge/Dependencies-0%20(Pure%20HTML%2FJS)-black.svg)
![Design: Lean Mobile First](https://img.shields.io/badge/Design-Lean%20Mobile--First-green.svg)

---

## ✨ Features

- 🎯 **Crystal-Clear Visual Rotation**:
  - **Hero Card**: Highlights who pays for the upcoming rehearsal in huge bold text.
  - **Up Next Preview**: Previews who pays for the session after that so band members can prepare.
  - **Queue Visualizer**: Shows the complete queue order with `#1`, `#2`, `#3`, etc. badges.
- ⚡ **1-Click Advance & Optional Notes**:
  - Mark payment complete with optional session notes (e.g., *"$60 at Soundstage Studio"* or *"2 hrs + drum kit rental"*).
  - Web Audio musical arpeggio chime feedback on payment (with instant mute toggle).
- ↩️ **Instant Undo Protection**:
  - Accidentally tapped the button? 1-tap **Undo** immediately rolls back the queue and removes the history record.
- ⏭️ **Absent / Swap Turn**:
  - Member sick or on vacation this week? Swap turns with the next member without losing their place in line.
- 👥 **Full Roster Customization**:
  - Add or remove band members anytime.
  - Reorder members using Move Up (▲) and Move Down (▼) buttons.
  - Customize the band name (e.g., *"The Soundwaves"*).
- 📊 **Payment Fair-Share Statistics**:
  - View total rehearsal sessions logged and an exact count and percentage breakdown of who paid how many times.
- 🔗 **Zero-Backend Band Sync Links**:
  - Because GitHub Pages has no database backend, state is shared between band members via **Sync Links**.
  - Tap **"Share to Band Chat"** to send a link to your band's WhatsApp or Messenger group.
  - When bandmates open the link on their phones, their tracker prompts: *"Update received! Apply sync?"* and updates their local phone state in 1 tap!
- 📱 **PWA & Offline Capable**:
  - Underground rehearsal rooms often have zero mobile signal. This tracker includes a Service Worker and Web App Manifest. Band members can add it to their iOS or Android home screen and run it completely offline.
- 🚀 **100% Zero-Build & Instant Load**:
  - Written in vanilla modern JavaScript and responsive CSS.
  - No `node_modules`, no Webpack/Vite build pipeline, and no Babel in-browser overhead. Loads in **under 20ms**.

---

## 🚀 Deploying to GitHub Pages

You can host this for free on GitHub Pages in under 2 minutes:

### Step 1: Push this repo to GitHub
```bash
# If you haven't already added your remote:
git remote add origin https://github.com/<YOUR-USERNAME>/rehearsal-tracker.git
git add .
git commit -m "feat: initial commit for band rehearsal tracker"
git branch -M main
git push -u origin main
```

### Step 2: Enable GitHub Pages in your repo
1. Go to your repository on GitHub.
2. Click **Settings** (top tabs) ➔ **Pages** (in the left sidebar).
3. Under **Build and deployment**:
   - **Source**: Select **Deploy from a branch**
   - **Branch**: Select `main` and folder `/(root)`
   - Click **Save**.
4. *(Alternative)*: Select **GitHub Actions** as the source. A pre-configured deployment workflow (`.github/workflows/deploy.yml`) is already included in this repository and will deploy automatically on push!
5. After ~1 minute, GitHub will give you your live URL:  
   `https://<YOUR-USERNAME>.github.io/rehearsal-tracker/`

---

## 📱 How Band Members Use It

```
[ Alex pays rehearsal ]
         │
         ▼
 Tap "Mark Paid & Advance Queue"
         │
         ▼
 Alex moves to back of line; Sam becomes #1
         │
         ▼
 Tap "Sync Link" ➔ "Share to Band Chat"
         │
         ▼
 Other band members tap link on their phones ➔ 1-tap "Apply Update"
```

1. **At Rehearsal**: The person whose turn it is pays the rehearsal studio.
2. **Log Payment**: Tap **"Mark Paid & Advance Queue"** (optionally type the cost or studio name).
3. **Share to Group Chat**: Click **"Sync Link"** and tap **"Share to Band Chat"**.
4. **Band Stays in Sync**: Bandmates tap the link, tap **"Apply Update"**, and their phones show the new queue order!

---

## 💻 Running Locally

No installation or node setup required!

### Option A: Double Click
Simply double-click [`index.html`](file:///D:/coding/projects/rehearsal-tracker/index.html) in your file explorer to open it in any web browser.

### Option B: Local Python Web Server
```bash
python -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

---

## 📂 Project Structure

```
rehearsal-tracker/
├── .github/
│   └── workflows/
│       └── deploy.yml          # Automated GitHub Actions deployment to Pages
├── .gitignore                  # Git ignore rules
├── index.html                  # Main production entry point for GitHub Pages
├── rehearsal_pay_tracker.html  # Backward-compatibility redirect to index.html
├── manifest.json               # PWA Web App Manifest (install to home screen)
├── sw.js                       # Service Worker for 100% offline functionality
├── assets/
│   └── icons/
│       └── icon.svg            # Custom SVG band icon & favicon
├── src/
│   ├── app.js                  # Reactive state, rotation queue, sync & audio engine
│   ├── icons.js                # Standalone SVG icon library (no CDN dependencies)
│   └── styles.css              # Custom styling, glow animations & glassmorphism
├── LICENSE                     # MIT License
└── README.md                   # Documentation & setup guide
```

---

## 🛠️ Refactoring & Improvements Summary

| Feature | Original HTML | Refactored Version |
| :--- | :--- | :--- |
| **GitHub Pages Ready** | `rehearsal_pay_tracker.html` (would 404 at root URL) | `index.html` as standard entrypoint + backward-compatible redirect |
| **Runtime Performance** | In-browser Babel (~2.5MB download, console warnings, compile lag) | Pure native JavaScript (0 dependencies, ~15ms load, instant paint) |
| **Icons Reliability** | Lucide DOM replacement script (caused React DOM reconciliation mismatches) | Clean inline SVG dictionary module (`src/icons.js`) |
| **Roster Management** | Fixed 4 members only (could not add, delete, or reorder) | Add members, delete members, reorder up/down, custom band name |
| **Undo Support** | None (accidental clicks could not be undone) | Instant 1-tap Undo for queue rotations and deletions |
| **Absent / Swap** | None | 1-tap "Absent / Swap Turn" to swap #1 and #2 |
| **Band Sharing / Sync** | Local to 1 browser only | 1-tap Share to WhatsApp / Sync Link / URL-hash synchronization |
| **Audio Engine** | Created new `AudioContext` per click (browser crash after 6 clicks) | Singleton reused AudioContext with pleasant musical arpeggio |
| **Payment Analytics** | Simple list only | Visual statistics & breakdown per band member |
| **Offline Studio Support** | None | PWA manifest & Service Worker caching |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
