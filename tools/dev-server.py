#!/usr/bin/env python3
"""Local stand-in for the credentagent.ai router (deploy/router/vercel.json in the library repo).

Serves this repo at / and proxies /marketplace-dev/* and /marketplace/* to the demo deployments,
so the in-browser demo runs same-origin locally exactly as it does on credentagent.ai.
Usage: python3 tools/dev-server.py [port]   (default 8787)
"""
import http.server
import os
import sys
import urllib.error
import urllib.request

ROUTES = {
    "/marketplace-dev/": "https://credentagent-demo-dev.vercel.app/",
    "/marketplace/": "https://credentagent-demo.vercel.app/",
}
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FORWARD_REQUEST = ("content-type", "accept", "mcp-session-id", "mcp-protocol-version")
FORWARD_RESPONSE = ("content-type", "mcp-session-id")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _target(self):
        for prefix, origin in ROUTES.items():
            if self.path.startswith(prefix):
                return origin + self.path[len(prefix):]
        return None

    def _proxy(self, target):
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k, v in self.headers.items() if k.lower() in FORWARD_REQUEST}
        request = urllib.request.Request(target, data=body, headers=headers, method=self.command)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                status, reply_headers, data = response.status, response.headers, response.read()
        except urllib.error.HTTPError as error:
            status, reply_headers, data = error.code, error.headers, error.read()
        self.send_response(status)
        for name in FORWARD_RESPONSE:
            if reply_headers.get(name):
                self.send_header(name, reply_headers.get(name))
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        target = self._target()
        return self._proxy(target) if target else super().do_GET()

    def do_POST(self):
        target = self._target()
        return self._proxy(target) if target else self.send_error(405)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print(f"credentagent.ai stand-in: http://localhost:{port}/  (proxying /marketplace-dev/, /marketplace/)")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
