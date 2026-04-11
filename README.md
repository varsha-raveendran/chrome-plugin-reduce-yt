# Procrastinate Not — YouTube Intent

> Vibe coded with [Claude](https://claude.ai) and [Cursor](https://cursor.sh)

A Chrome extension (Manifest V3) that reduces unconscious YouTube usage through intent-setting, lightweight friction, and session analytics.

## Features

- **Intent modal** — blocks the page when you open YouTube and asks what you're here to do. Requires a non-empty intent, a max session time (minutes), and optional allowed topic keywords to start.
- **Friction overlay** — optional 3-second "Still want to watch?" overlay when you click a video thumbnail. Auto-navigates after the countdown; Skip/Cancel/Escape/Enter all work. Shows an intent-match indicator (👏 on track / 😢 off track) based on keyword overlap with your session intent. After 5 skips, shows a nudge message.
- **Burst intervention** — check-in modal fires when you open 5+ videos within 3 minutes.
- **Duration intervention** — check-in modal and browser notification fire when the session's max time is reached (via background alarm), with a 2-minute cooldown after dismissal.
- **Active-time tracking** — watch time is counted while the tab is visible (window focus is not required).
- **Video categorization** — titles are scored with keyword heuristics into Technical, Hobby, Travel, or Entertainment. Categories can be manually overridden per-video.
- **Session analytics popup** — click the toolbar icon to see current intent, elapsed/active time, max time limit, videos opened, unique videos, top videos by watch time, category breakdown, and recent session history.
- **Full analytics page** — aggregated charts (daily/weekly/monthly/yearly) for category watch time, sessions by time of day, and period totals.
- **Session history** — last 20 completed sessions saved to local storage; click any entry to open a detail view.
- **Video notes** — floating Notes button on watch pages lets you jot thoughts per video, auto-saved per session. View, filter, and delete all notes from the Notes tab.

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
  notes.js                — NotesController (floating notes panel on watch pages)
  main.js                 — entry point
ui/
  analytics.html/.js/.css — toolbar popup
  charts.html/.js/.css    — full-page aggregated analytics
  session.html/.js        — per-session detail view
  categorize.js           — title-scoring categorization logic
  notes.html/.js          — Notes tab (view, filter, delete all notes)
  app.html                — full-page session view (Session / Analytics / Notes tabs)
  modal.css               — friction, intent modal, and notes panel styles
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

### Session limits

When starting a session you set:
- **Max time** — how many minutes you allow yourself (default 20). Shown in the popup. When elapsed time crosses this limit, a browser notification fires and an in-page check-in modal appears.
- **Allowed topics** — optional comma-separated keywords (e.g. `react, cooking`). The friction overlay uses these to tell you whether a video is on- or off-topic.

### Interventions

| Trigger | Condition |
|---|---|
| Burst | 5+ video navigations within 3 minutes |
| Duration | Elapsed time ≥ session max time (checked every minute by background alarm) |

The check-in modal shows your stated intent and current stats. You can continue or end the session.

### Friction overlay

When enabled in settings, clicking any video thumbnail shows a 3-second countdown card with the video title. Navigation is automatic after the countdown, or you can:
- **Skip** — navigate immediately
- **Cancel** — go back
- **Escape** — cancel
- **Enter** — skip

The overlay also shows an intent-match indicator: if the video title keywords overlap with your session intent, it shows 👏 "Looks on track with your intent"; otherwise 😢 "Doesn't seem related to your intent". After 5 skips in a session, the title changes to a nudge message asking if you're still on track.

### Video notes

A floating **📝 Notes** button appears on any YouTube watch page. Clicking it opens a side panel where you can write and save notes for the current video. Notes are scoped to the video and session, and stored locally (up to 500 entries).

The **Notes tab** (`notes.html`) lets you:
- Search across video titles, session intents, and note text
- Filter by category (Technical, Hobby, Travel, Entertainment)
- Edit or delete individual notes
- Clear all notes at once

### Video categorization

Titles are scored against keyword rules for Technical, Hobby, and Travel. Unmatched videos fall into Entertainment. You can override any video's category in the popup; overrides persist in local storage.

## Storage keys

| Key | Contents |
|---|---|
| `pn_session` | Active session (intent, startTs, maxTimeMs, allowedTopics, active flag) |
| `pn_session_stats` | Current session stats (videos, watch times, nav events) |
| `pn_session_history` | Last 20 completed sessions |
| `pn_last_active` | Last user activity timestamp (for inactivity detection) |
| `pn_settings` | `{ frictionEnabled: true/false }` |
| `pn_category_overrides` | `{ [videoId]: category }` manual overrides |
| `pn_notes` | Array of note objects (max 500) — videoId, title, url, sessionIntent, entries |
