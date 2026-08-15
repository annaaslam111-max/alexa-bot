import os
import re
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-3.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

SYSTEM_PROMPT = """You are Alexa, a sharp, warm, and slightly witty voice assistant with a JARVIS-style presence.
Rules:
- Keep replies very short (1-2 sentences), since they are spoken aloud and speed matters.
- Never use markdown, asterisks, bullet points, headers, or emojis. Plain spoken sentences only.
- Be direct, helpful, and a little personable — like a trusted assistant, not a search engine.
- If you don't know something, say so plainly instead of guessing.
"""


def strip_markdown(text: str) -> str:
    """Remove markdown artifacts so text-to-speech doesn't read out symbols."""
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    text = re.sub(r"__(.*?)__", r"\1", text)
    text = re.sub(r"`{1,3}(.*?)`{1,3}", r"\1", text)
    text = re.sub(r"#{1,6}\s*", "", text)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"\n{2,}", " ", text)
    text = re.sub(r"\n", " ", text)
    return text.strip()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/chat", methods=["POST"])
def chat():
    if not GEMINI_API_KEY:
        return jsonify({"error": "Server misconfigured: missing API key."}), 500

    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()

    if not user_message:
        return jsonify({"error": "Empty message."}), 400

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        "generationConfig": {
            "temperature": 0.8,
            "maxOutputTokens": 120,
        },
    }

    try:
        response = requests.post(
            GEMINI_URL,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY,  # header, not URL — keeps the key out of logs/exception traces
            },
            json=payload,
            timeout=30,
        )
        response.raise_for_status()
        result = response.json()

        reply = (
            result.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )

        if not reply:
            reply = "I didn't quite catch a response for that. Could you rephrase?"

        reply = strip_markdown(reply)
        return jsonify({"reply": reply})

    except Exception:
        # Catch-all: network errors, timeouts, malformed JSON, unexpected API shape, etc.
        # Never forward the original exception (it could contain the request URL/key) to the client.
        return jsonify({"error": "I'm having trouble reaching my brain right now. Try again in a moment."}), 502


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    # Final safety net so Flask never renders a debug traceback (which could expose
    # environment variables including GEMINI_API_KEY) to the client in any code path.
    return jsonify({"error": "Something went wrong on the server."}), 500


if __name__ == "__main__":
    # debug is OFF by default — only turn on locally by explicitly setting FLASK_DEBUG=1.
    # A debug traceback page would expose local variables, including GEMINI_API_KEY.
    debug_mode = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug_mode, port=5000)
