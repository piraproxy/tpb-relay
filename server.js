const express = require('express');
const { HttpsProxyAgent } = require('https-proxy-agent');
const app = express();

const DATAIMPULSE_PROXY = process.env.DATAIMPULSE_PROXY;
const PORT = process.env.PORT || 3000;

// Store last known IP
let lastKnownIP = 'unknown';

// Function to get current IP through DataImpulse
async function updateCurrentIP() {
  try {
    // Create NEW agent each time (forces new connection)
    const agent = new HttpsProxyAgent(DATAIMPULSE_PROXY);
    const response = await fetch('https://api.ipify.org?format=json', {
      agent: agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    const data = await response.json();
    lastKnownIP = data.ip;
    console.log(`Updated IP: ${lastKnownIP}`);
    return lastKnownIP;
  } catch (e) {
    console.log('IP check failed:', e.message);
    return lastKnownIP;
  }
}

// Update IP every 10 seconds (faster to see rotation)
setInterval(updateCurrentIP, 10000);
// Initial check
updateCurrentIP();

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
    currentIP: lastKnownIP 
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
