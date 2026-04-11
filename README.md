# 🐱 Still Want To Watch? (SWTW)

> Vibe coded with [Claude](https://claude.ai) and [Cursor](https://cursor.sh)

You opened YouTube to watch one video. Forty minutes later you're deep in a compilation of cats failing to jump onto things. We've all been there.

**SWTW** is a Chrome extension I built for myself to fix exactly that. Before you can watch anything, it asks you what you're actually here for. Then it gets mildly annoying about it: a countdown overlay when you click a video, check-ins when you've been spiraling for too long, and an honest tally of how you spent your time. It's not meant to block YouTube; it's meant to make unconscious usage a little more conscious.

https://github.com/user-attachments/assets/c98cb22b-3f0e-4d14-a3e7-76956476ce60

## Features

- **Intent gate:** YouTube won't let you in until you say why you're there. Takes 5 seconds and saves you from 45 minutes of drift.
- **Friction overlay:** click a thumbnail and get a "still want to watch this?" moment before it loads. Shows whether the video actually matches what you said you were here for. After 5 skips in a row, it starts asking if you're still on track.
- **Burst check-in:** opened 5 videos in 3 minutes? SWTW notices and checks in.
- **Duration check-in:** hit your time limit and you'll get a nudge (in-page modal + browser notification) asking if you meant to still be here.
- **Active-time tracking:** only counts time when you're actually on the tab, not just when it's open in the background.
- **Video categorization:** tags each video as Technical, Hobby, Travel, Finance, News, or Entertainment based on the title. You can override any video's category if it got it wrong.
- **Session popup:** click the toolbar icon for a quick snapshot: your intent, time spent, videos watched, and how the session's going.
- **Full analytics:** daily, weekly, monthly, and yearly breakdowns of what you actually watched and when.
- **Session history:** last 20 sessions saved locally, each one clickable for a full breakdown.
- **Video notes:** a floating notes panel on watch pages so you can jot things down while watching. All notes are searchable and filterable from the Notes tab.
- **Cat mood widget:** a draggable cat emoji sits in the corner of every YouTube page and gets progressively more disappointed the longer you watch past your limit. 😸 happy while on track, 😾 grumpy once over, 🙀 horrified after 15 min, 😿 devastated after 30 min, and truly inconsolable after 45. Its current mood also shows in the popup. Can be toggled off in Settings.
- **Settings:** toggle the friction overlay and cat widget, teach SWTW new synonyms for your intent keywords, or remap words to categories. Your rules layer on top of the defaults.

## Project structure

```
manifest.json
background/
  service_worker.js       # alarms, message relay, session lifecycle
content/
  constants.js            # shared thresholds and storage keys
  storage.js              # chrome.storage.local helpers
  spa.js                  # reliable SPA URL-change detection
  ui_modal.js             # modal and focus-trap utilities
  session.js              # SessionManager (intent, tracking, interventions)
  friction.js             # FrictionController (click-intercept overlay)
  notes.js                # NotesController (floating notes panel on watch pages)
  main.js                 # entry point
ui/
  analytics.html/.js/.css # toolbar popup
  charts.html/.js/.css    # full-page aggregated analytics
  session.html/.js        # per-session detail view
  categorize.js           # title-scoring categorization logic
  notes.html/.js          # Notes tab (view, filter, delete all notes)
  settings.html/.js       # Settings tab (friction toggle, custom expansions, custom taxonomy)
  app.html                # full-page session view (Session / Analytics / Notes / Settings tabs)
  modal.css               # friction, intent modal, and notes panel styles
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
- **Max time:** how many minutes you allow yourself (default 20). Shown in the popup. When elapsed time crosses this limit, a browser notification fires and an in-page check-in modal appears.
- **Category:** optional broad category for the session (Technical, Hobby, Travel, Entertainment). Used by the friction overlay to infer relevance and set the countdown duration (3s for Technical, 60s for all others).
- **Allowed topics:** optional comma-separated keywords (e.g. `react, cooking`). Takes precedence over category-based inference in the friction overlay.

### Interventions

| Trigger | Condition |
|---|---|
| Burst | 5+ video navigations within 3 minutes |
| Duration | Elapsed time ≥ session max time (checked every minute by background alarm) |

The check-in modal shows your stated intent and current stats. You can continue or end the session.

### Friction overlay

When enabled in settings, clicking any video thumbnail shows a countdown card with the video title. Navigation is automatic after the countdown, or you can:
- **Skip wait:** navigate immediately
- **Cancel:** go back
- **Escape:** cancel
- **Enter:** skip wait

The countdown duration depends on your session category: **3 seconds** for Technical sessions, **60 seconds** for everything else.

The overlay shows an intent-match indicator using a three-tier inference system:
1. **Allowed topics** (if set) — exact keyword match against the title
2. **Category** (if set) — checks the title against the expected topic domain
3. **Semantic inference** — expands intent keywords with synonyms, then falls back to a broad topic taxonomy (tech, cooking, fitness, travel, music, gaming, entertainment, etc.)

After 5 skips in a session, the title changes to a nudge message asking if you're still on track.

### Settings

Open the full-page view and click the **Settings** tab. Options:

- **Friction overlay:** toggle the countdown overlay on/off without opening `chrome://extensions`
- **Semantic expansions:** add synonyms for any intent keyword. Example: add `bouldering` with synonyms `climbing, crimp, overhang` so that intent matches against those title words too. Synonyms can be removed individually or the whole topic group deleted.
- **Topic taxonomy:** map any word to a broad category (Technical, Entertainment, Cooking, Fitness, Travel, Music, Gaming, Finance, Science). Example: `bouldering → Fitness`. Used by the friction overlay's category-based inference. Entries are deletable.

Custom rules extend the built-in defaults and take effect on the next YouTube page load.

### Video notes

A floating **📝 Notes** button appears on any YouTube watch page. Clicking it opens a side panel where you can write and save notes for the current video. Notes are scoped to the video and session, and stored locally (up to 500 entries).

The **Notes tab** (`notes.html`) lets you:
- Search across video titles, session intents, and note text
- Filter by category (Technical, Hobby, Travel, Entertainment)
- Edit or delete individual notes
- Clear all notes at once

### Video categorization

Titles are scored against keyword rules for Technical, Hobby, Travel, Finance, and News. Unmatched videos fall into Entertainment. You can override any video's category in the popup; overrides persist in local storage.

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
