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

// Add a catch-all for other /api routes to prevent 404/500
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.url} not found on serverless function` });
});

export default app;
