"""MinX AI backend.

Run with:
    python minx_app.py

The service uses only the Python standard library so the app can run on a
fresh machine. If GEMINI_API_KEY or MINX_GEMINI_API_KEY is set, /ask will call
Gemini. Without a key, it returns a focused local EV assistant response.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
import time
import urllib.error
import urllib.request
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
HOST = os.environ.get("MINX_HOST", "127.0.0.1")
PORT = int(os.environ.get("MINX_PORT", os.environ.get("PORT", "5000")))
GEMINI_API_KEY = os.environ.get("MINX_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("MINX_GEMINI_MODEL", "gemini-1.5-flash")
MAX_MESSAGE_CHARS = 2000

SYSTEM_PROMPT = """You are MinX AI, a concise EV assistant for Indian drivers.
Help with charging, battery health, range estimates, charger planning, route
advice, and safe EV usage. Be practical, specific, and honest when information
is approximate. Keep replies under 180 words unless the user asks for detail."""


class MinxHandler(SimpleHTTPRequestHandler):
    server_version = "MinXAI/1.0"

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stdout.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self._allowed_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        if path == "/health":
            self._send_json(
                {
                    "ok": True,
                    "service": "MinX AI",
                    "provider": "gemini" if GEMINI_API_KEY else "local",
                    "model": GEMINI_MODEL if GEMINI_API_KEY else "local-ev-advisor",
                    "time": int(time.time()),
                }
            )
            return
        if path == "/voice":
            self._send_html(voice_page())
            return
        if path == "/":
            self._send_file(BASE_DIR / "index.html")
            return
        self._send_static(path)

    def do_POST(self) -> None:
        path = self.path.split("?", 1)[0]
        if path != "/ask":
            self.send_error(HTTPStatus.NOT_FOUND, "Unknown endpoint")
            return

        payload = self._read_json()
        message = str(payload.get("message", "")).strip()
        if not message:
            self._send_json({"error": "Message is required."}, HTTPStatus.BAD_REQUEST)
            return
        if len(message) > MAX_MESSAGE_CHARS:
            self._send_json({"error": "Message is too long."}, HTTPStatus.BAD_REQUEST)
            return

        profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
        lang = str(payload.get("lang", "en"))[:8]

        provider = "local"
        try:
            if GEMINI_API_KEY:
                answer = ask_gemini(message, profile, lang)
                provider = "gemini"
            else:
                answer = local_ev_answer(message, profile, lang)
        except Exception as exc:
            self.log_message("AI provider fallback: %s", exc)
            answer = local_ev_answer(message, profile, lang)

        self._send_json({"response": answer, "provider": provider})

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(min(length, 64_000))
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {}
        return data if isinstance(data, dict) else {}

    def _send_json(self, data: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, file_path: Path) -> None:
        try:
            resolved = file_path.resolve()
            if BASE_DIR not in resolved.parents and resolved != BASE_DIR:
                raise ValueError("Path outside app directory")
            if not resolved.exists() or not resolved.is_file():
                self.send_error(HTTPStatus.NOT_FOUND, "File not found")
                return
            body = resolved.read_bytes()
            content_type = mimetypes.guess_type(str(resolved))[0] or "application/octet-stream"
            if resolved.suffix.lower() in {".html", ".css", ".js"}:
                content_type += "; charset=utf-8"
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except OSError as exc:
            self.send_error(HTTPStatus.INTERNAL_SERVER_ERROR, str(exc))
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN, "Forbidden")

    def _send_static(self, request_path: str) -> None:
        clean = request_path.lstrip("/")
        self._send_file(BASE_DIR / clean)

    def _allowed_origin(self) -> str:
        configured = os.environ.get("MINX_ALLOWED_ORIGIN")
        if configured:
            return configured
        return self.headers.get("Origin") or "*"


def ask_gemini(message: str, profile: dict[str, Any], lang: str) -> str:
    context = build_context(profile, lang)
    body = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": f"{context}\n\nUser: {message}"}]}],
        "generationConfig": {"temperature": 0.35, "maxOutputTokens": 512},
    }
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=18) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gemini HTTP {exc.code}: {details[:300]}") from exc

    candidates = data.get("candidates") or []
    parts = (
        candidates[0]
        .get("content", {})
        .get("parts", [])
        if candidates and isinstance(candidates[0], dict)
        else []
    )
    text = "\n".join(str(part.get("text", "")).strip() for part in parts if part.get("text"))
    if not text:
        raise RuntimeError("Gemini returned no text")
    return text


def build_context(profile: dict[str, Any], lang: str) -> str:
    car = profile.get("carName") or "not selected"
    battery = profile.get("battery")
    ev_range = profile.get("range")
    destination = profile.get("destination") or "not provided"
    return (
        f"Language preference: {lang}. "
        f"EV profile: car={car}, battery={battery}%, range={ev_range} km, "
        f"destination={destination}."
    )


def local_ev_answer(message: str, profile: dict[str, Any], lang: str) -> str:
    text = re.sub(r"\s+", " ", message.lower()).strip()
    car = str(profile.get("carName") or "your EV")
    battery = safe_int(profile.get("battery"))
    ev_range = safe_int(profile.get("range"))

    prefix = language_prefix(lang)
    details = []
    if battery is not None:
        details.append(f"battery {battery}%")
    if ev_range is not None:
        details.append(f"about {ev_range} km range")
    context = f"For {car}" + (f" with {', '.join(details)}" if details else "")

    if any(word in text for word in ("hello", "hi", "hey")):
        return prefix + "Hi, I am MinX AI. Ask me about EV range, charging, route planning, or battery health."

    if any(word in text for word in ("charger", "charging station", "station", "nearest")):
        return (
            prefix
            + context
            + ", use Find Charger to highlight the closest station on the map. Prefer DC fast charging for trips, "
            "but use slower AC charging for routine overnight charging when you can."
        )

    if any(word in text for word in ("range", "km", "distance", "trip", "route")):
        if ev_range is not None:
            reserve = max(15, round(ev_range * 0.2))
            usable = max(0, ev_range - reserve)
            return (
                prefix
                + f"{context}, plan around {usable} km of usable driving and keep roughly {reserve} km as reserve. "
                "For highways, add a charging stop earlier than the estimate because speed, AC use, traffic, and elevation can reduce range."
            )
        return (
            prefix
            + "Save your EV profile first so I can estimate usable range. As a rule, keep a 15-20% battery buffer on any unfamiliar route."
        )

    if any(word in text for word in ("battery", "health", "degrade", "degradation", "life")):
        if battery is not None and battery < 20:
            return prefix + f"{context}, charge soon. Frequent deep discharge below 10-15% can age the pack faster."
        if battery is not None and battery > 85:
            return prefix + f"{context}, you are fine for a trip. For daily use, avoid holding the battery near 100% for long periods."
        return (
            prefix
            + context
            + ", the healthiest daily habit is staying around 20-80%, avoiding heat, and using fast charging mainly when travel needs it."
        )

    if any(word in text for word in ("cost", "price", "money", "bill", "unit", "kwh")):
        return (
            prefix
            + "Charging cost is roughly units used multiplied by your electricity tariff. Example: 20 kWh at Rs 10 per kWh costs about Rs 200, "
            "before any station service fee."
        )

    if any(word in text for word in ("fast", "dc", "slow", "ac")):
        return (
            prefix
            + "DC fast charging is best for travel stops. AC charging is gentler and usually cheaper for daily charging. "
            "If time is not critical, AC overnight charging is the better routine choice."
        )

    return (
        prefix
        + context
        + ", I can help with charger choice, range buffers, battery health, route planning, and charging cost. "
        "Ask a specific EV question and I will give a practical recommendation."
    )


def language_prefix(lang: str) -> str:
    if lang == "hi":
        return "Hindi mode: "
    if lang == "ta":
        return "Tamil mode: "
    return ""


def safe_int(value: Any) -> int | None:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def voice_page() -> str:
    return """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MinX Voice Bot</title>
  <style>
    :root { color-scheme: dark; font-family: Arial, sans-serif; background: #080c10; color: #e8edf5; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    main { width: min(720px, 100%); background: #111822; border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #9aadc4; line-height: 1.6; }
    button { border: 0; border-radius: 8px; padding: 12px 16px; background: #0088ff; color: white; font-weight: 700; cursor: pointer; }
    button.secondary { background: #1b2633; color: #e8edf5; border: 1px solid rgba(255,255,255,.1); }
    textarea { width: 100%; min-height: 120px; margin: 16px 0; border-radius: 8px; border: 1px solid rgba(255,255,255,.12); background: #0d1117; color: #e8edf5; padding: 12px; resize: vertical; }
    #answer { white-space: pre-wrap; margin-top: 16px; padding: 16px; background: #0d1117; border-radius: 8px; color: #dce7f5; }
    .row { display: flex; gap: 10px; flex-wrap: wrap; }
  </style>
</head>
<body>
  <main>
    <h1>MinX Voice Bot</h1>
    <p>Speak or type an EV question. Voice input uses your browser speech engine.</p>
    <textarea id="question" placeholder="Ask about range, charging, battery health, or route planning..."></textarea>
    <div class="row">
      <button onclick="startVoice()">Start voice</button>
      <button class="secondary" onclick="ask()">Ask MinX AI</button>
      <button class="secondary" onclick="location.href='/'">Open dashboard</button>
    </div>
    <div id="answer" aria-live="polite"></div>
  </main>
  <script>
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    async function ask() {
      const message = document.getElementById('question').value.trim();
      if (!message) return;
      document.getElementById('answer').textContent = 'Thinking...';
      const res = await fetch('/ask', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({message})
      });
      const data = await res.json();
      document.getElementById('answer').textContent = data.response || data.error || 'No response.';
    }
    function startVoice() {
      if (!SpeechRecognition) {
        document.getElementById('answer').textContent = 'Voice recognition is not supported in this browser.';
        return;
      }
      const rec = new SpeechRecognition();
      rec.lang = 'en-IN';
      rec.onresult = event => {
        document.getElementById('question').value = event.results[0][0].transcript;
        ask();
      };
      rec.start();
    }
  </script>
</body>
</html>"""


def main() -> None:
    os.chdir(BASE_DIR)
    httpd = ThreadingHTTPServer((HOST, PORT), MinxHandler)
    provider = "Gemini" if GEMINI_API_KEY else "local EV assistant"
    print(f"MinX AI server running at http://{HOST}:{PORT}/")
    print(f"Provider: {provider}")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nMinX AI server stopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
