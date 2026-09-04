# Flappy AKME

Retro 8-bit arcade. Ride the duck, dodge the pipes, stamp 3-letter initials.

This folder is the **entire Netlify site**. No npm. No Vite. No React. No build.

## Files

| File | What it is |
|---|---|
| `index.html` | Game page (must stay at repo root, this exact name) |
| `style.css` | CRT cabinet + arcade UI |
| `game.js` | Physics, pipes, audio, scores, overlays |
| `netlify.toml` | Empty build, publish `.` |
| `_redirects` | All routes → `index.html` |
| `assets/character.png` | AKME-cap duck rider |
| `assets/background.png` | Night city skyline |

## Play on your computer

Open `index.html` in a browser.

## Push to GitHub → Netlify

1. Create a GitHub repo (example: `flappy-akme`).
2. Upload **everything in this folder to the repo root** — not inside a nested folder.
3. In Netlify: **Add new site → Import from Git** → pick that repo.
4. Build settings:
   - Build command: *(leave empty)*
   - Publish directory: `.`
5. Deploy. The live URL is your game.

`netlify.toml` already sets publish to `.` so you should not need to type those settings.

## Controls

Tap / click / Space / W / A / gamepad A to flap. First tap powers the cabinet. VOL mutes.

## Scores

Top 10 lives in the player's browser (`localStorage`). Score 0 is not posted. Default initials: AKM.
