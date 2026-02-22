const http = require('http');

const PORT = 8081;
const TARGET_HOST = '169.254.71.90';
const TARGET_PORT = 8081;

const server = http.createServer((req, res) => {
    const options = {
        hostname: TARGET_HOST,
        port: TARGET_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers
    };

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (e) => {
        console.error(`problem with request: ${e.message}`);
        if (!res.headersSent) {
            res.writeHead(502);
            res.end('Bad Gateway');
        }
    });

    req.pipe(proxyReq, { end: true });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 iPhone Camera Proxy running on http://0.0.0.0:${PORT}`);
});
