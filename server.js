const express = require('express');
const { HttpsProxyAgent } = require('https-proxy-agent');
const app = express();

const DATAIMPULSE_PROXY = process.env.DATAIMPULSE_PROXY;
const PORT = process.env.PORT || 3000;

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }
  
  console.log(`Proxying: ${targetUrl}`);
  
  try {
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
    
    // Extract the actual IP address used from the agent socket
    // The HttpsProxyAgent exposes the socket which has the remote address
    let usedIP = 'unknown';
    try {
      // Try to get IP from the agent's socket
      if (agent && agent.socket && agent.socket.remoteAddress) {
        usedIP = agent.socket.remoteAddress;
      }
      // Alternative: check if we can get it from response connection
      else if (response && response.socket && response.socket.remoteAddress) {
        usedIP = response.socket.remoteAddress;
      }
    } catch (e) {
      console.log('Could not extract IP:', e.message);
    }
    
    console.log(`Used IP: ${usedIP}`);
    
    // Set headers including the IP for CF Worker to log
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-DataImpulse-IP', usedIP);
    res.setHeader('X-Render-Proxy', 'true');
    res.status(response.status).send(text);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({ 
      error: 'Proxy failed', 
      message: error.message 
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'TPB Relay is running' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
