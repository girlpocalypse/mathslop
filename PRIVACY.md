# mathslop privacy policy

Last updated: 2026-10-19

mathslop is a math scratchpad that runs in Chrome's side panel. It doesn't collect, send or share any
data.

## What it stores

- The lines on your pad, the Answers setting (Off / Arithmetic / Algebra) and the Colors setting.
- These are saved with `chrome.storage.local`, which keeps them in your Chrome profile on your own device.
  They are not synced to your Google account and not sent anywhere.
- Clearing the pad deletes the saved lines. Removing the extension deletes everything it saved.

## What it doesn't do

- No accounts, no analytics, no tracking, no ads, no cookies.
- No network access. Every library (MathLive and Compute Engine) and every font is bundled with the
  extension, and nothing is loaded from the internet. The extension's Content Security Policy also blocks
  connections (`connect-src 'none'` on the panel, `default-src 'none'` on the math engine frame).
- It doesn't read web pages, tabs or your browsing history, and has no host permissions.
- It writes to your clipboard only when you copy something (a line's tex button, clicking an answer, Copy all
  as LaTeX, a line's right-click menu, or Ctrl+C / Ctrl+X). It reads the clipboard only when you paste.

Nothing is sold or given to anyone, because nothing leaves your device.

## Changes

If this ever changes, this file will be updated before the new version is published, and the date above
will change with it.

## Contact

Open an issue at https://github.com/girlpocalypse/mathslop/issues
