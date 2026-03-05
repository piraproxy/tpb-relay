const express = require('express');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { ModuleClient, SessionClient } = require('tlsclientwrapper');

const app = express();

const DATAIMPULSE_PROXY = process.env.DATAIMPULSE_PROXY;
const PORT = process.env.PORT || 3000;

// Global module client (worker pool)
let moduleClient = null;

// Initialize tlsclientwrapper
async function initTlsClient() {
  try {
    moduleClient = new ModuleClient({
      maxThreads: 4 // Free plan friendly - don't use too many threads
    });
    console.log('✅ TLS Client initialized with Chrome fingerprint');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize TLS Client:', error.message);
    return false;
  }
}

// Parse proxy URL for tlsclientwrapper format
function getProxyUrl() {
  // tlsclientwrapper expects proxy URL in standard format
  // It should already be in env: http://user:pass@host:port
  return DATAIMPULSE_PROXY;
}

// tlsclientwrapper request with browser fingerprint
async function fetchWithTlsClient(targetUrl) {
  if (!moduleClient) {
    throw new Error('TLS Client not initialized');
  }

  const proxyUrl = getProxyUrl();
  
  // Create session with Chrome fingerprint and proxy
  const session = new SessionClient(moduleClient, {
    tlsClientIdentifier: 'chrome_120', // Spoofs Chrome 120 JA3 fingerprint
    proxyUrl: proxyUrl,
    timeoutSeconds: 30,
    defaultHeaders: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': 'https://thepiratebay.org/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Cache-Control': 'no-cache'
    }
  });

  try {
    const response = await session.get(targetUrl);
    
    // Check if we got blocked
    if (response.status === 429) {
      console.log('⚠️ tlsclientwrapper got 429 - fingerprint may need rotation');
    }
    
    return {
      status: response.status,
      body: response.body,
      headers: response.headers
    };
  } finally {
    await session.destroySession();
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
  
  // Try tlsclientwrapper first if available
  if (moduleClient) {
    try {
      console.log('🔄 Trying tlsclientwrapper with Chrome 120 fingerprint...');
      const result = await fetchWithTlsClient(targetUrl);
      
      console.log(`✅ tlsclientwrapper success: ${result.status}`);
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.status(result.status).send(result.body);
      return;
      
    } catch (tlsError) {
      console.error(`❌ tlsclientwrapper failed: ${tlsError.message}`);
      console.log('⚠️ Falling back to standard fetch...');
    }
  } else {
    console.log('⚠️ TLS Client not available, using fallback...');
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
    status: 'TPB Relay with tlsclientwrapper',
    tlsClient: moduleClient ? 'initialized' : 'not available',
    fallback: 'standard fetch'
  });
});

// Initialize and start server
async function start() {
  // Try to init TLS client, but don't fail if it doesn't work
  await initTlsClient();
  
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Proxy: ${DATAIMPULSE_PROXY ? 'Configured' : 'NOT SET'}`);
  });
}

start();
