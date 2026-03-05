const express = require('express');
const { HttpsProxyAgent } = require('https-proxy-agent');
const tlsClient = require('tls-client');

const app = express();

const DATAIMPULSE_PROXY = process.env.DATAIMPULSE_PROXY;
const PORT = process.env.PORT || 3000;

// Parse proxy URL for tls-client format
function parseProxy(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 823,
      username: url.username,
      password: url.password
    };
  } catch (e) {
    console.error('Failed to parse proxy URL:', e.message);
    return null;
  }
}

// tls-client request with browser fingerprint
async function fetchWithTlsClient(targetUrl) {
  const proxy = parseProxy(DATAIMPULSE_PROXY);
  if (!proxy) {
    throw new Error('Invalid proxy configuration');
  }

  // tls-client session with Chrome fingerprint
  const session = new tlsClient.Session({
    tlsClientIdentifier: 'chrome_120', // Spoofs Chrome 120 JA3 fingerprint
    proxy: {
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://thepiratebay.org/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    }
  });

  try {
    const response = await session.get(targetUrl);
    
    // Check if we got blocked
    if (response.status === 429) {
      console.log('⚠️ tls-client got 429 - may need different fingerprint');
    }
    
    return {
      status: response.status,
      body: response.body,
      headers: response.headers
    };
  } finally {
    session.destroy();
  }
}

// Fallback to original method if tls-client fails
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
  
  // Try tls-client first
  try {
    console.log('🔄 Trying tls-client with Chrome fingerprint...');
    const result = await fetchWithTlsClient(targetUrl);
    
    console.log(`✅ tls-client success: ${result.status}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(result.status).send(result.body);
    return;
    
  } catch (tlsError) {
    console.error(`❌ tls-client failed: ${tlsError.message}`);
    console.log('⚠️ Falling back to standard fetch...');
  }
  
  // Fallback to original method
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
    status: 'TPB Relay with tls-client',
    tlsClient: 'enabled',
    fallback: 'standard fetch'
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`TLS Client: Enabled (Chrome 120 fingerprint)`);
  console.log(`Proxy: ${DATAIMPULSE_PROXY ? 'Configured' : 'NOT SET'}`);
});
