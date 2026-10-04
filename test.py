import functools
import html
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent
BROWSERS = ("google-chrome", "chromium", "chromium-browser", "chrome")


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args: object) -> None:
        pass


# serves the repo and runs tests/index.html in headless Chrome
def run_js_tests() -> None:
    browser = next((path for name in BROWSERS if (path := shutil.which(name))), None)
    if browser is None:
        sys.exit("FAIL: the tests need Chrome or Chromium on PATH")
    server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory() as profile:
            dom = subprocess.run(
                [browser, "--headless=new", "--disable-gpu", f"--user-data-dir={profile}", "--virtual-time-budget=60000",
                 "--dump-dom", f"http://127.0.0.1:{server.server_port}/tests/index.html"],
                capture_output=True, text=True, timeout=120,
            ).stdout
    finally:
        server.shutdown()
    match = re.search(r'<pre id="results">(.*?)</pre>', dom, re.S)
    results = html.unescape(match.group(1)) if match else "no results (the test page didn't load)"
    print(results)
    if not results.endswith("all passed"):
        sys.exit(1)


if __name__ == "__main__":
    run_js_tests()
