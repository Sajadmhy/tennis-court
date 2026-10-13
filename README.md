# Tennis Coach – Persian (RTL) landing page

Static site, no build step: plain HTML, CSS and JavaScript.

```
index.html          page markup (lang="fa", dir="rtl")
css/styles.css      all styles
js/hero.js          WebGL hero scene (racket, ball, court) – exposes window.createHero
js/main.js          starts/pauses the hero (reduced-motion and WebGL fallbacks)
js/booking.js       booking widget (type → day → time → details → confirm)
```

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

Opening `index.html` directly also works.

## Put it on GitHub

```bash
git init
git add .
git commit -m "Initial commit: Persian tennis coach landing page"
git branch -M main
git remote add origin git@github.com:<your-username>/<repo>.git
git push -u origin main
```

Any static host serves it from the repository root (GitHub Pages, Netlify, Cloudflare Pages).

## Demo content to replace

- Text in `[square brackets]` is placeholder copy (name, prices, bio, address, contact, cancellation policy).
- The coach photo is a placeholder block (`.coach__photo` in `index.html`).
- Footer social links point to `#top`.
- The booking widget is front-end only. Slot availability is fake (`isTaken()` in `js/booking.js`) and
  "confirm" just shows the success screen. The form fields have `name` attributes ready for a real endpoint.
- The Vazirmatn font loads from Google Fonts; download it into the repo if the site must work without it.
