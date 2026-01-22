const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// MIDDLEWARE (Setup)
app.use(cors()); // Allow requests from different sources
app.use(express.json()); // Parse JSON data
app.use(express.static('public')); // Serve files from the 'public' folder

// FUNCTION: Rewrite URLs inside HTML so they stay in the proxy
// Example: <a href="/about"> becomes <a href="/proxy?url=https://site.com/about">
function rewriteUrls(html, targetUrl, proxyBase) {
    return html.replace(/(href|src)=["']([^"']*)["']/g, (match, attr, value) => {
        // Don't rewrite data URIs or fragments
        if (value.startsWith('data:') || value.startsWith('#')) return match;
        
        try {
            // Convert relative URLs to absolute URLs
            const absoluteUrl = new URL(value, targetUrl).toString();
            // Rewrite to point back through proxy
            return `${attr}="${proxyBase}?url=${encodeURIComponent(absoluteUrl)}"`;
        } catch (e) {
            // If URL parsing fails, keep the original
            return match;
        }
    });
}

// ENDPOINT: /proxy - The main proxy handler
// This fetches websites and serves them through an iframe
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    
    // Check if user provided a URL
    if (!targetUrl) {
        return res.status(400).send('❌ No URL provided');
    }

    try {
        // Step 1: Fetch the target website
        const response = await axios.get(targetUrl, {
            headers: {
                // Pretend to be a normal browser so sites don't block us
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            responseType: 'text' // Get response as text so we can modify it
        });

        // Step 2: Strip security headers that prevent iframe loading
        res.set('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval'");
        res.removeHeader('X-Frame-Options'); // This is the KEY - it stops the "You can't iframe me" block
        
        const contentType = response.headers['content-type'] || 'text/html';
        
        // Step 3: If it's HTML, rewrite the URLs
        if (contentType.includes('text/html')) {
            const proxyBase = `${req.protocol}://${req.get('host')}/proxy`;
            const rewrittenHtml = rewriteUrls(response.data, targetUrl, proxyBase);
            res.set('Content-Type', 'text/html');
            return res.send(rewrittenHtml);
        }

        // Step 4: For images, CSS, JS, just send them through as-is
        res.set('Content-Type', contentType);
        res.send(response.data);

    } catch (error) {
        // If something goes wrong, send a friendly error message
        res.status(500).send(`
            <h1 style="color: red;">❌ Error Loading Page</h1>
            <p>${error.message}</p>
            <p>The website may be:</p>
            <ul>
                <li>Down or unreachable</li>
                <li>Blocking proxy servers</li>
                <li>Using very strict security settings</li>
            </ul>
        `);
    }
});

// START: Listen for incoming requests
app.listen(PORT, () => {
    console.log('🚀 Proxy Server is RUNNING');
    console.log(`📍 Open your browser to: http://localhost:${PORT}`);
    console.log(`\n💡 Press Ctrl+C to stop the server`);
});
