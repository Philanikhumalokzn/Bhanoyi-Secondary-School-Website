# Bhanoyi Secondary School Website – Content Editing Guide

## 1) Update website text/content
- Open `assets/content/site-content.json` (source of truth)
- Edit:
  - `school` for global school details (phone, email, address, hours)
  - `navigation` for main menu items
  - `pages` for each page content (`home`, `about`, `academics`, etc.)
- The app serves content from `public/content/site-content.json` at runtime.
- `npm.cmd run dev` and `npm.cmd run build` now auto-sync the file from `assets/content/site-content.json` to `public/content/site-content.json`.

## 2) Add or update downloadable documents
- Place files in `public/documents/`
- In `assets/content/site-content.json`, update the related `downloads` section item `href`
- Example href format:
  - `/documents/admission-policy.txt`

## 3) Add a new announcement
- In a page `sections` array, add an item with:
  - `type: "announcements"`
  - `title`
  - `items` with `date`, `tag`, `title`, `body`

## 4) Local testing
- Install packages (first time):
  - `npm.cmd install`
- Start local dev server:
  - `npm.cmd run dev`
- Build production files:
  - `npm.cmd run build`

## 5) Notes
- Keep JSON valid (commas/quotes are required).
- If the site breaks after content edits, check JSON formatting first.
- Build output is generated in `dist/`.
- If needed, run manual sync with: `npm.cmd run sync-content`.
