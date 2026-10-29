# 🎸 Band Rehearsal Pay Tracker

> **Never argue about who pays for the next band rehearsal again.**  
> A lightweight, zero-dependency, mobile-first rotational payment queue for musicians, deployed on **GitHub Pages** with permanent **Firebase Realtime Database** cloud synchronization.

🌐 **Live App**: [https://calicdu.github.io/rehearsal-tracker/](https://calicdu.github.io/rehearsal-tracker/)

---

## ✨ Features

- 🎯 **Crystal-Clear Visual Rotation**:
  - **Hero Card**: Highlights who pays for the upcoming rehearsal in huge bold text.
  - **Up Next Preview**: Previews who pays for the session after that so band members can prepare.
  - **Queue Visualizer**: Shows the complete queue order with `#01`, `#02`, `#03`, etc. badges.
- ⚡ **1-Click Advance & Optional Notes**:
  - Mark payment complete with optional session notes (e.g., *"$50 @ Soundstage"* or *"2 hrs + drum kit rental"*).
  - Subtle acoustic click feedback on action (with instant mute toggle).
- ↩️ **Instant Undo Protection**:
  - Accidentally tapped the button? 1-tap **Undo** immediately rolls back the queue and removes the history record.
- ⏭️ **Absent / Skip Turn**:
  - Member sick or on vacation this week? Swap turns with the next member without losing their place in line.
- 👥 **Streamlined Roster & Band Editor**:
  - Add or remove band members anytime.
  - Reorder members using Move Up (▲) and Move Down (▼) buttons.
  - Customize the band name.
  - Pure native input fields with zero typing lag or glitching—type your changes and tap **Save Changes** to commit to the database.
- 📊 **Payment Fair-Share Statistics**:
  - Tap the bar chart icon in the header to view total sessions logged and an exact count and percentage breakdown of who paid how many times.
- ☁️ **Permanent Cloud Database Sync**:
  - Hardcoded connection to Google Firebase Realtime Database.
  - Every time a payment is logged or the roster is updated, it automatically syncs to the cloud.
  - When bandmates open the app or return to the browser tab, the tracker automatically fetches the latest state.
  - Zero setup required by band members: no URLs to enter and no accounts required.
- 📱 **Mobile-First Obsidian & Slate Design**:
  - Glare-free matte silver-slate primary action button (`#d4d9e1`) on an obsidian dark theme (`#090a0f`).
  - Modern typography using Vercel's **Geist** and **Geist Mono**.
  - Thumb-friendly mobile ergonomics (52px+ button touch targets, native bottom sheets).
  - Minimalist layout with no clutter or unnecessary bars.
- 📴 **PWA & Offline Capable**:
  - Underground rehearsal rooms often have zero mobile signal. This tracker includes a Service Worker and Web App Manifest (`manifest.json`). Band members can add it to their iOS or Android home screen and run it completely offline.
- 🚀 **100% Zero-Build & Instant Load**:
  - Written in vanilla modern JavaScript and responsive utility CSS.
  - No `node_modules`, no Webpack/Vite build pipeline, and no runtime compilation overhead. Loads in under 20ms.

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Tailwind CSS (via CDN).
- **Typography**: Geist & Geist Mono (via Google Fonts).
- **Icons**: Custom embedded SVG library (`src/icons.js`) with zero external font/script dependencies.
- **Audio**: Web Audio API oscillator synthesis (reusable singleton context).
- **Storage**: Browser `localStorage` (instant offline persistence) + Google Firebase Realtime Database REST API.
- **Hosting**: GitHub Pages via automated GitHub Actions workflow (`.github/workflows/deploy.yml`).

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
├── manifest.json               # PWA Web App Manifest (install to mobile home screen)
├── sw.js                       # Service Worker for 100% offline functionality
├── assets/
│   └── icons/
│       └── icon.svg            # Custom SVG band icon & favicon
├── src/
│   ├── app.js                  # State management, queue rotation, cloud sync & UI rendering
│   ├── config.js               # Permanent Firebase Realtime Database URL
│   ├── icons.js                # Standalone inline SVG icon dictionary
│   └── styles.css              # Obsidian theme styling, animations & mobile ergonomics
├── LICENSE                     # MIT License
└── README.md                   # Documentation & project guide
```

---

## 💻 Running Locally

No npm or build tools needed!

### Option A: Double Click
Double-click `index.html` in your file explorer to open it directly in any web browser.

### Option B: Local Python Web Server
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your browser.

---

## 🚀 Deployment & Updates

The project is deployed to GitHub Pages at:  
`https://calicdu.github.io/rehearsal-tracker/`

Whenever you want to publish local changes:
```bash
git add .
git commit -m "your commit message"
git push origin main
```
GitHub Actions will automatically build and deploy the changes to GitHub Pages in ~30 seconds.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
