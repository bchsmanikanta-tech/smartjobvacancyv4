#!/usr/bin/env python3
"""
AI Resume Analysis Microservice
Lightweight HTTP API service providing text extraction and AI resume diagnostics.
Accessible at: http://localhost:5005/api/analyze-resume
"""

import os
import sys
import json
import base64
import tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler

# Import analyzer
try:
    from backend.resume_analyzer import analyze_resume_file
except ImportError:
    from resume_analyzer import analyze_resume_file

PORT = int(os.environ.get("PORT", 5005))


class ResumeServiceHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/health' or self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            response = {"status": "ok", "service": "AI Resume Analysis Service", "version": "1.0.0"}
            self.wfile.write(json.dumps(response).encode('utf-8'))
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Endpoint not found"}).encode('utf-8'))

    def do_POST(self):
        if self.path.startswith('/api/analyze-resume'):
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": "Empty request body."}).encode('utf-8'))
                return

            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body.decode('utf-8'))
                filename = data.get('filename', 'resume.pdf')
                b64_content = data.get('base64', '')
                
                if not b64_content:
                    # Maybe raw text was supplied
                    raw_text = data.get('text', '')
                    if raw_text:
                        with tempfile.NamedTemporaryFile('w', delete=False, suffix='.txt', encoding='utf-8') as tmp:
                            tmp.write(raw_text)
                            tmp_path = tmp.name
                    else:
                        raise ValueError("Neither 'base64' file content nor 'text' was provided.")
                else:
                    ext = os.path.splitext(filename)[1] or '.pdf'
                    with tempfile.NamedTemporaryFile('wb', delete=False, suffix=ext) as tmp:
                        tmp.write(base64.b64decode(b64_content))
                        tmp_path = tmp.name

                analysis = analyze_resume_file(tmp_path, original_filename=filename)
                
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(analysis).encode('utf-8'))

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e), "readable": False}).encode('utf-8'))
        else:
            self.send_response(404)
            self._send_cors_headers()
            self.end_headers()


def run(port=PORT):
    server_address = ('', port)
    httpd = HTTPServer(server_address, ResumeServiceHandler)
    print(f"AI Resume Analysis Service listening on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down AI Resume Analysis Service.")
        httpd.server_close()


if __name__ == "__main__":
    run()
