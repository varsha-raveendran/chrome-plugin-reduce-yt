# Procrastinate Not — YouTube Intent

A Chrome extension (Manifest V3) that reduces unconscious YouTube usage through intent-setting, lightweight friction, and session analytics.

## Features

- **Intent modal** — blocks the page when you open YouTube and asks what you're here to do. Requires a non-empty intent to start.
- **Friction overlay** — optional 3-second "Still want to watch?" overlay when you click a video thumbnail. Auto-navigates after the countdown; Skip/Cancel/Escape/Enter all work.
- **Burst intervention** — check-in modal fires when you open 5+ videos within 3 minutes.
- **Duration intervention** — check-in modal fires at the 20-minute mark (via background alarm), with a 2-minute cooldown after dismissal.
- **Active-time tracking** — watch time is counted only while the tab is visible and focused.
- **Video categorization** — titles are scored with keyword heuristics into Technical, Hobby, Travel, or Entertainment. Categories can be manually overridden per-video.
- **Session analytics popup** — click the toolbar icon to see current intent, elapsed/active time, videos opened, unique videos, top videos by watch time, category breakdown, and recent session history.
- **Full analytics page** — aggregated charts (daily/weekly/monthly/yearly) for category watch time, sessions by time of day, and period totals.
- **Session history** — last 20 completed sessions saved to local storage; click any entry to open a detail view.

## Project structure

```
manifest.json
background/
  service_worker.js       — alarms, message relay, session lifecycle
content/
  constants.js            — shared thresholds and storage keys
  storage.js              — chrome.storage.local helpers
  spa.js                  — reliable SPA URL-change detection
  ui_modal.js             — modal and focus-trap utilities
  session.js              — SessionManager (intent, tracking, interventions)
  friction.js             — FrictionController (click-intercept overlay)
  main.js                 — entry point
ui/
  analytics.html/.js/.css — toolbar popup
  charts.html/.js/.css    — full-page aggregated analytics
  session.html/.js        — per-session detail view
  categorize.js           — title-scoring categorization logic
  app.html                — options/settings page
  modal.css               — friction and intent modal styles
```

## Install (unpacked)

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder
4. Visit `https://www.youtube.com/`

## How it works

### Session lifecycle

| Event | Behavior |
|---|---|
| First YouTube visit | Intent modal blocks the page |
| 30+ min of inactivity | Intent modal shown again on return |
| End Session clicked | Session saved to history, tab closed |

### Interventions

| Trigger | Condition |
|---|---|
| Burst | 5+ video navigations within 3 minutes |
| Duration | 20-minute session (background alarm) |

The check-in modal shows your stated intent and current stats. You can continue or end the session.

### Friction overlay

When enabled in settings, clicking any video thumbnail shows a 3-second countdown card with the video title. Navigation is automatic after the countdown, or you can:
- **Skip** — navigate immediately
- **Cancel** — go back
- **Escape** — cancel
- **Enter** — skip

### Video categorization

Titles are scored against keyword rules for Technical, Hobby, and Travel. Unmatched videos fall into Entertainment. You can override any video's category in the popup; overrides persist in local storage.

## Storage keys

| Key | Contents |
|---|---|
| `pn_session` | Active session (intent, startTs, active flag) |
| `pn_session_stats` | Current session stats (videos, watch times, nav events) |
| `pn_session_history` | Last 20 completed sessions |
| `pn_last_active` | Last user activity timestamp (for inactivity detection) |
| `pn_settings` | `{ frictionEnabled: true/false }` |
| `pn_category_overrides` | `{ [videoId]: category }` manual overrides |
