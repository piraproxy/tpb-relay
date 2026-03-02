const express = require('express');
const { HttpsProxyAgent } = require('https-proxy-agent');
const app = express();

const DATAIMPULSE_PROXY = process.env.DATAIMPULSE_PROXY;
const PORT = process.env.PORT || 3000;

// Helper function to make request with fresh agent
async function fetchWithRotation(targetUrl) {
  // Create NEW agent for every request (forces new connection/IP)
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
    // Clean up agent to free connection
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
  
  try {
    const response = await fetchWithRotation(targetUrl);
    const text = await response.text();
    
    console.log(`Success: ${response.status}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
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
  res.json({ status: 'TPB Relay is running with rotation' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT} (rotation enabled)`);
});
