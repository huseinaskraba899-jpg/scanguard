const http = require('http');

const PORT = 8080;
const TARGET_HOST = '192.168.178.108';
const TARGET_PORT = 8081;

const server = http.createServer((req, res) => {
    // Automatically inject the Basic Auth header so the browser doesn't prompt the user
    const auth = Buffer.from('admin:admin').toString('base64');

    // Some streams need explicit paths, pass through from the browser request
    const path = req.url === '/camera' ? '/' : req.url;

    const options = {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: path,
        method: req.method,
        headers: {
            ...req.headers,
            'Authorization': `Basic ${auth}`
        }
    };

    // Remove host header so we don't confuse the target server
    delete options.headers['host'];

    const proxyReq = http.request(options, (proxyRes) => {
        // Inject CORS headers so the React dashboard overlay works
        const headers = { ...proxyRes.headers };
        delete headers['access-control-allow-origin'];
        delete headers['access-control-allow-methods'];
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';

        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (e) => {
        console.error(`Proxy stream error: ${e.message}`);
        if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
        }
    });

    req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Stream Proxy running on http://0.0.0.0:${PORT} -> http://${TARGET_HOST}:${TARGET_PORT}`);
});
