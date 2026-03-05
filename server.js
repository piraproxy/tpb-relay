const express = require('express');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ProxyAgent, request } = require('undici');

const app = express();

const DATAIMPULSE_PROXY = process.env.DATAIMPULSE_PROXY;
const PORT = process.env.PORT || 3000;

// Parse proxy URL for undici
function createProxyAgent() {
  try {
    return new ProxyAgent(DATAIMPULSE_PROXY);
  } catch (e) {
    console.error('Invalid proxy URL:', e.message);
    return null;
  }
}

// undici request with browser headers - NO COMPRESSION
async function fetchWithUndici(targetUrl) {
  const proxyAgent = createProxyAgent();
  if (!proxyAgent) {
    throw new Error('Failed to create proxy agent');
  }

  try {
    const { statusCode, body } = await request(targetUrl, {
      dispatcher: proxyAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        // KEY CHANGE: Don't accept compressed responses
        'Accept-Encoding': 'identity', 
        'Referer': 'https://thepiratebay.org/',
        'Origin': 'https://thepiratebay.org',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Cache-Control': 'no-cache'
      },
      timeout: 30000
    });

    const data = await body.text();
    
    return {
      status: statusCode,
      body: data
    };
  } finally {
    // undici handles cleanup
  }
}

// Fallback to original method
async function fetchWithRotation(targetUrl) {
  const agent = new HttpsProxyAgent(DATAIMPULSE_PROXY);
  
  try {
    const response = await fetch(targetUrl, {
      agent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    
    return response;
  } finally {
    if (agent && agent.destroy) {
      agent.destroy();
    }
  }
}

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  console.log(`Proxying: ${targetUrl}`);
  
  // Try undici first
  try {
    console.log('🔄 Trying undici (no compression)...');
    const result = await fetchWithUndici(targetUrl);
    
    // Validate it's actually JSON before sending
    const trimmed = result.body.trim();
    if (!(trimmed.startsWith('[') || trimmed.startsWith('{'))) {
      console.log(`⚠️ Response not JSON: ${trimmed.substring(0, 100)}`);
      throw new Error('Non-JSON response from undici');
    }
    
    console.log(`✅ undici success: ${result.status} (JSON valid)`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(result.status).send(result.body);
    return;
    
  } catch (undiciError) {
    console.error(`❌ undici failed: ${undiciError.message}`);
    console.log('⚠️ Falling back to standard fetch...');
  }
  
  // Fallback
  try {
    const response = await fetchWithRotation(targetUrl);
    const text = await response.text();
    
    console.log(`✅ Fallback success: ${response.status}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(response.status).send(text);
    
  } catch (error) {
    console.error(`❌ Fallback failed: ${error.message}`);
    res.status(500).json({ 
      error: 'Proxy failed', 
      message: error.message 
    });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'TPB Relay with undici (no compression)',
    proxy: DATAIMPULSE_PROXY ? 'Configured' : 'NOT SET'
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
