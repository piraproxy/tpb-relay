const express = require('express');
const { HttpsProxyAgent } = require('https-proxy-agent');
const app = express();

const DATAIMPULSE_PROXY = process.env.DATAIMPULSE_PROXY;
const PORT = process.env.PORT || 3000;

// Store last known IP
let lastKnownIP = 'unknown';

// Function to get current IP through DataImpulse (what websites see)
async function updateCurrentIP() {
  try {
    // Create NEW agent each time (forces new connection)
    const agent = new HttpsProxyAgent(DATAIMPULSE_PROXY);
    const response = await fetch('https://httpbin.org/ip', {
      agent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    const data = await response.json();
    // httpbin returns IP in "origin" field
    lastKnownIP = data.origin || 'unknown';
    console.log(`Updated IP: ${lastKnownIP}`);
    return lastKnownIP;
  } catch (e) {
    console.log('IP check failed:', e.message);
    return lastKnownIP;
  }
}

// Update IP every 10 seconds
setInterval(updateCurrentIP, 10000);
// Initial check
updateCurrentIP();

// NEW ENDPOINT: Check current IP
app.get('/check-ip', async (req, res) => {
  try {
    const agent = new HttpsProxyAgent(DATAIMPULSE_PROXY);
    const response = await fetch('https://httpbin.org/ip', {
      agent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    const data = await response.json();
    const currentIP = data.origin || 'unknown';
    
    res.json({ 
      currentIP: currentIP,
      lastKnownIP: lastKnownIP,
      note: 'This is the residential IP that websites (like apibay) see',
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ 
      error: 'Failed to check IP', 
      message: e.message 
    });
  }
});

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  console.log(`Proxying: ${targetUrl} (using IP: ${lastKnownIP})`);
  
  try {
    // Create NEW agent for each request (forces rotation)
    const agent = new HttpsProxyAgent(DATAIMPULSE_PROXY);
    
    const response = await fetch(targetUrl, {
      agent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      }
    });
    
    const text = await response.text();
    console.log(`Success: ${response.status}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-DataImpulse-IP', lastKnownIP);
    res.status(response.status).send(text);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ 
      error: 'Proxy failed', 
      message: error.message 
    });
  }
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'TPB Relay is running',
    currentIP: lastKnownIP,
    checkEndpoint: '/check-ip'
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
