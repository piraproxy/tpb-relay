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
  res.json({ status: 'TPB Relay is running' });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
