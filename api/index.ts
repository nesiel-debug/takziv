import { google } from 'googleapis';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());
app.use(cookieParser());

// Vercel has a read-only filesystem, so we must use /tmp for any file writes
const CONFIG_FILE = path.join('/tmp', 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return { income: 11000 };
}

const getOAuth2Client = (req: express.Request) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  // Ensure this matches exactly what is configured in Google Cloud Console
  const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/auth/callback`;
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

app.get('/api/debug', (req, res) => {
  res.json({
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    appUrl: process.env.APP_URL,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/auth/url', (req, res) => {
  try {
    console.log('Generating auth URL...');
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return res.status(400).json({ error: 'MISSING_CREDENTIALS' });
    }
    const oauth2Client = getOAuth2Client(req);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file'
      ],
      prompt: 'consent'
    });
    res.json({ url });
  } catch (error: any) {
    console.error('Auth URL Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code);
    
    // In a real app, we'd store these tokens securely.
    // For now, we'll send a success message to the parent window.
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0f2f5;">
          <div style="text-align: center; background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #1a73e8;">ההתחברות הצליחה!</h2>
            <p>החלון ייסגר באופן אוטומטי בעוד רגע...</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS',
                  tokens: ${JSON.stringify(tokens)}
                }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('Callback Error:', error);
    res.status(500).send('Authentication failed: ' + error.message);
  }
});

// Add a catch-all for other /api routes to prevent 404/500
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found on serverless function` });
});

export default app;
