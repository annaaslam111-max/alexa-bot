# Alexa — JARVIS-style Voice Assistant

Flask + Gemini 3.5 Flash talking bot with a Three.js HUD orb, browser-based speech recognition (STT) and speech synthesis (TTS), and PWA support so it can be packaged into an APK.

## Structure
```
alexa-bot/
├── app.py                 Flask backend, Gemini REST calls
├── templates/index.html   Main HUD page
├── static/
│   ├── css/style.css      JARVIS-style HUD styling
│   ├── js/main.js         Three.js orb + Web Speech API + fetch to /chat
│   ├── manifest.json      PWA manifest
│   ├── sw.js              Service worker
│   └── icons/             App icons (192, 512)
├── .env                   Your local API key (never commit)
├── .env.example           Template for the key
├── .gitignore
├── Procfile                web: gunicorn app:app
└── requirements.txt
```

## Run locally
```bash
pip install -r requirements.txt
# put your real key in .env
python app.py
```
Open `http://localhost:5000`. Mic access requires HTTPS or `localhost` — both work.

## Deploy to Railway
1. Push this folder to GitHub (keep `templates/` and `static/` as real subfolders — don't let the upload flatten them).
2. In Railway: New Project → Deploy from GitHub repo.
3. Go to **Variables** tab → add `GEMINI_API_KEY` with your real key.
4. Railway auto-detects the `Procfile` and deploys. You'll get an HTTPS link.

## Turn it into an APK
1. Go to **pwabuilder.com**.
2. Paste your Railway HTTPS URL.
3. It scans `manifest.json` + `sw.js` automatically.
4. Click **Package for Android** → download the APK.
5. Sideload onto your phone (enable "install from unknown sources") and allow microphone permission on first launch.

## Notes
- Model used: `gemini-3.5-flash` via direct REST call (no SDK), matching your usual stack.
- The `/chat` route is explicitly excluded from service-worker caching so responses are always fresh.
- Markdown is stripped server-side before text is sent to speech synthesis.
- "Alexa" is used here as a project/character name — note that Amazon holds this as a trademark for its own assistant product, so if you ever plan to publish this publicly (Play Store, portfolio launch, etc.) it's worth considering a distinct name to avoid confusion.
