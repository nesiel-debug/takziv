import { google } from 'googleapis';
import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());
app.use(cookieParser());

const CONFIG_FILE = path.join('/tmp', 'config.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      return { income: 11000 };
    }
  }
  return { income: 11000 };
}

const getOAuth2Client = (req: express.Request) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const redirectUri = new URL('/api/auth/callback', baseUrl).toString();
  
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
    nodeEnv: process.env.NODE_ENV
  });
});

app.get('/api/auth/url', (req, res) => {
  try {
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
    res.status(500).json({ error: error.message });
  }
});

export default app;
