# Procrastinate Not — YouTube Intent

> Vibe coded with [Claude](https://claude.ai) and [Cursor](https://cursor.sh)

A Chrome extension (Manifest V3) that reduces unconscious YouTube usage through intent-setting, lightweight friction, and session analytics.

## Features

- **Intent modal** — blocks the page when you open YouTube and asks what you're here to do. Requires a non-empty intent, a max session time (minutes), an optional category (Technical / Hobby / Travel / Entertainment), and optional allowed topic keywords to start.
- **Friction overlay** — "Still want to watch?" overlay when you click a video thumbnail. Auto-navigates after the countdown (3 seconds for technical sessions, 60 seconds otherwise); Skip/Cancel/Escape/Enter all work. Shows an intent-match indicator based on semantic topic inference against your session intent and category. After 5 skips, shows a nudge message.
- **Burst intervention** — check-in modal fires when you open 5+ videos within 3 minutes.
- **Duration intervention** — check-in modal and browser notification fire when the session's max time is reached (via background alarm), with a 2-minute cooldown after dismissal.
- **Active-time tracking** — watch time is counted while the tab is visible (window focus is not required).
- **Video categorization** — titles are scored with keyword heuristics into Technical, Hobby, Travel, or Entertainment. Categories can be manually overridden per-video.
- **Session analytics popup** — click the toolbar icon to see current intent, elapsed/active time, max time limit, videos opened, unique videos, top videos by watch time, category breakdown, and recent session history.
- **Full analytics page** — aggregated charts (daily/weekly/monthly/yearly) for category watch time, sessions by time of day, and period totals.
- **Session history** — last 20 completed sessions saved to local storage; click any entry to open a detail view.
- **Video notes** — floating Notes button on watch pages lets you jot thoughts per video, auto-saved per session. View, filter, and delete all notes from the Notes tab.
- **Settings page** — configure the friction overlay toggle, add custom semantic expansions (topic → synonyms), and add custom topic taxonomy entries (term → category). Custom rules extend the built-in defaults and take effect on the next page load.

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
  settings.html/.js       — Settings tab (friction toggle, custom expansions, custom taxonomy)
  app.html                — full-page session view (Session / Analytics / Notes / Settings tabs)
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
- **Category** — optional broad category for the session (Technical, Hobby, Travel, Entertainment). Used by the friction overlay to infer relevance and set the countdown duration (3s for Technical, 60s for all others).
- **Allowed topics** — optional comma-separated keywords (e.g. `react, cooking`). Takes precedence over category-based inference in the friction overlay.

### Interventions

| Trigger | Condition |
|---|---|
| Burst | 5+ video navigations within 3 minutes |
| Duration | Elapsed time ≥ session max time (checked every minute by background alarm) |

The check-in modal shows your stated intent and current stats. You can continue or end the session.

### Friction overlay

When enabled in settings, clicking any video thumbnail shows a countdown card with the video title. Navigation is automatic after the countdown, or you can:
- **Skip** — navigate immediately
- **Cancel** — go back
- **Escape** — cancel
- **Enter** — skip

The countdown duration depends on your session category: **3 seconds** for Technical sessions, **60 seconds** for everything else.

The overlay shows an intent-match indicator using a three-tier inference system:
1. **Allowed topics** (if set) — exact keyword match against the title
2. **Category** (if set) — checks the title against the expected topic domain
3. **Semantic inference** — expands intent keywords with synonyms, then falls back to a broad topic taxonomy (tech, cooking, fitness, travel, music, gaming, entertainment, etc.)

After 5 skips in a session, the title changes to a nudge message asking if you're still on track.

### Settings

Open the full-page view and click the **Settings** tab. Options:

- **Friction overlay** — toggle the countdown overlay on/off without opening `chrome://extensions`
- **Semantic expansions** — add synonyms for any intent keyword. Example: add `bouldering` with synonyms `climbing, crimp, overhang` so that intent matches against those title words too. Synonyms can be removed individually or the whole topic group deleted.
- **Topic taxonomy** — map any word to a broad category (Technical, Entertainment, Cooking, Fitness, Travel, Music, Gaming, Finance, Science). Example: `bouldering → Fitness`. Used by the friction overlay's category-based inference. Entries are deletable.

Custom rules extend the built-in defaults and take effect on the next YouTube page load.

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
| `pn_session` | Active session (intent, startTs, maxTimeMs, allowedTopics, category, active flag) |
| `pn_session_stats` | Current session stats (videos, watch times, nav events) |
| `pn_session_history` | Last 20 completed sessions |
| `pn_last_active` | Last user activity timestamp (for inactivity detection) |
| `pn_settings` | `{ frictionEnabled, customExpansions, customTaxonomy }` |
| `pn_category_overrides` | `{ [videoId]: category }` manual overrides |
| `pn_notes` | Array of note objects (max 500) — videoId, title, url, sessionIntent, entries |
