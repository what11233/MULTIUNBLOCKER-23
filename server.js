const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rewrite URLs to stay in proxy
function rewriteUrls(html, targetUrl, proxyBase) {
    if (typeof html !== 'string') return html;
    
    return html.replace(/(href|src)=["']([^"']*)["']/g, (match, attr, value) => {
        if (value.startsWith('data:') || value.startsWith('#') || value.startsWith('javascript:')) {
            return match;
        }
        try {
            const absoluteUrl = new URL(value, targetUrl).toString();
            return `${attr}="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            return match;
        }
    });
}

// Main proxy endpoint
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    if (!targetUrl) {
        return res.status(400).json({ error: 'No URL provided' });
    }

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000,
            maxRedirects: 5
        });

        const contentType = response.headers['content-type'] || '';
        const proxyBase = `/proxy`;

        // If it's HTML, rewrite URLs
        if (contentType.includes('text/html')) {
            let html = response.data;
            html = rewriteUrls(html, targetUrl, proxyBase);
            
            // Remove security headers that block iframes
            res.removeHeader('X-Frame-Options');
            res.set('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval'");
            res.set('Content-Type', 'text/html; charset=utf-8');
            
            return res.send(html);
        }

        // For other content types, just pass through
        res.set('Content-Type', contentType);
        res.send(response.data);

    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).json({ 
            error: 'Failed to load website',
            details: error.message 
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log('🚀 Unblocker Server RUNNING');
    console.log(`📍 Visit: http://localhost:${PORT}`);
    console.log(`🛠️  Proxy endpoint: http://localhost:${PORT}/proxy?url=ENCODED_URL`);
});
