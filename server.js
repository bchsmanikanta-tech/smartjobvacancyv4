/**
 * Smart Job Vacancy Finder - Lightweight HTTP / API Server
 * Built with standard Node.js (Zero external dependencies needed)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // Enable CORS for API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let reqUrl = req.url.split('?')[0];
    if (reqUrl === '/') reqUrl = '/index.html';

    // AI Resume Analysis API Endpoint
    if (req.method === 'POST' && reqUrl.startsWith('/api/analyze-resume')) {
        let bodyChunks = [];
        req.on('data', chunk => bodyChunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(bodyChunks).toString('utf-8');
            const { spawn } = require('child_process');
            const child = spawn('python', [path.join(PUBLIC_DIR, 'backend', 'resume_analyzer.py')], { cwd: PUBLIC_DIR });
            
            let stdoutData = '';
            let stderrData = '';
            child.stdout.on('data', d => stdoutData += d);
            child.stderr.on('data', d => stderrData += d);
            
            child.on('close', (code) => {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                if (stdoutData.trim()) {
                    res.end(stdoutData);
                } else {
                    res.end(JSON.stringify({
                        success: false,
                        readable: false,
                        error: stderrData || 'Execution error during resume analysis.'
                    }));
                }
            });

            child.on('error', (err) => {
                res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({
                    success: false,
                    error: `Failed to launch Python analyzer: ${err.message}`
                }));
            });

            child.stdin.write(body);
            child.stdin.end();
        });
        return;
    }

    const filePath = path.join(PUBLIC_DIR, reqUrl);

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1><p>Smart Job Vacancy Finder</p>');
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Smart Job Vacancy Finder server running at:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});
