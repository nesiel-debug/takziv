import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());
app.use(cookieParser());

const PORT = 3000;
const CONFIG_FILE = path.join(process.cwd(), 'config.json');

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

function saveConfig(config: any) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const getOAuth2Client = (req: express.Request) => {
  // Use the host from the request to ensure the redirect URI matches the URL the user is currently on
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers.host;
  const baseUrl = process.env.APP_URL || `${protocol}://${host}`;
  const redirectUri = new URL('/auth/callback', baseUrl).toString();
  
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
};

async function ensureSettingsSheet(sheets: any, spreadsheetId: string) {
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = spreadsheet.data.sheets.find((s: any) => s.properties.title === 'הגדרות');
    if (!sheet) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            addSheet: { properties: { title: 'הגדרות' } }
          }]
        }
      });
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'הגדרות!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            ['Key', 'Value'],
            ['income', '11000'],
            ['categories', JSON.stringify(['מזון וצריכה', 'מסעדות ובתי קפה', 'תחבורה ורכבים', 'דלק, חשמל וגז', 'ביטוח', 'עירייה וממשלה', 'פנאי ובידור', 'אופנה וביגוד', 'עיצוב הבית', 'חשמל ומחשבים', 'שונות', 'מעשרות'])],
            ['budgets', '{}'],
            ['incomes', JSON.stringify([{ id: '1', name: 'הכנסה שלי', amount: 11000 }])],
            ['budgetStartDate', new Date().toISOString().slice(0, 7)],
            ['budgetStartDay', '10'],
            ['savingsGoal', '0.25']
          ]
        }
      });
    }
  } catch (error) {
    console.error('Error ensuring settings sheet:', error);
  }
}

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
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send('No code provided');
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code);
    
    const config = loadConfig();
    if (tokens.refresh_token) {
      config.refresh_token = tokens.refresh_token;
    }
    config.access_token = tokens.access_token;

    oauth2Client.setCredentials({
      refresh_token: config.refresh_token,
      access_token: config.access_token
    });
    
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    if (!config.spreadsheetId) {
      const spreadsheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: 'ניהול תקציב ביתי - משותף'
          },
          sheets: [{
            properties: { title: 'הוצאות' }
          }]
        }
      });

      config.spreadsheetId = spreadsheet.data.spreadsheetId;
      config.spreadsheetUrl = spreadsheet.data.spreadsheetUrl;

      await sheets.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: 'הוצאות!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [['ID', 'תאריך', 'שם ההוצאה', 'סכום', 'סוג']]
        }
      });
    }

    saveConfig(config);

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', spreadsheetUrl: '${config.spreadsheetUrl}' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>ההתחברות הצליחה. החלון ייסגר אוטומטית.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Auth Error:', error);
    res.status(500).send('Authentication failed. Please check your Google Client ID and Secret.');
  }
});

app.get('/api/auth/status', (req, res) => {
  const config = loadConfig();
  if (config.refresh_token && config.spreadsheetId) {
    res.json({ connected: true, spreadsheetUrl: config.spreadsheetUrl });
  } else {
    res.json({ connected: false });
  }
});

app.post('/api/auth/disconnect', (req, res) => {
  const config = loadConfig();
  delete config.refresh_token;
  delete config.access_token;
  delete config.spreadsheetId;
  delete config.spreadsheetUrl;
  saveConfig(config);
  res.json({ success: true });
});

app.get('/api/settings', async (req, res) => {
  const config = loadConfig();
  if (!config.refresh_token || !config.spreadsheetId) {
    return res.json({ 
      income: config.income || 11000,
      categories: config.categories || ['מזון וצריכה', 'מסעדות ובתי קפה', 'תחבורה ורכבים', 'דלק, חשמל וגז', 'ביטוח', 'עירייה וממשלה', 'פנאי ובידור', 'אופנה וביגוד', 'עיצוב הבית', 'חשמל ומחשבים', 'שונות', 'מעשרות'],
      budgets: config.budgets || {}
    });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials({ refresh_token: config.refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    await ensureSettingsSheet(sheets, config.spreadsheetId);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: 'הגדרות!A2:B',
    });
    
    const rows = response.data.values || [];
    const settings: any = {
      income: 11000,
      categories: ['מזון וצריכה', 'מסעדות ובתי קפה', 'תחבורה ורכבים', 'דלק, חשמל וגז', 'ביטוח', 'עירייה וממשלה', 'פנאי ובידור', 'אופנה וביגוד', 'עיצוב הבית', 'חשמל ומחשבים', 'שונות', 'מעשרות'],
      budgets: {},
      incomes: [{ id: '1', name: 'הכנסה שלי', amount: 11000 }],
      budgetStartDate: new Date().toISOString().slice(0, 7),
      budgetStartDay: 10,
      savingsGoal: 0.25
    };
    
    rows.forEach(row => {
      if (row[0] === 'income') settings.income = parseFloat(row[1]) || 11000;
      if (row[0] === 'categories') {
        try { settings.categories = JSON.parse(row[1]); } catch(e){}
      }
      if (row[0] === 'budgets') {
        try { settings.budgets = JSON.parse(row[1]); } catch(e){}
      }
      if (row[0] === 'incomes') {
        try { settings.incomes = JSON.parse(row[1]); } catch(e){}
      }
      if (row[0] === 'budgetStartDate') settings.budgetStartDate = row[1];
      if (row[0] === 'budgetStartDay') settings.budgetStartDay = parseInt(row[1]) || 10;
      if (row[0] === 'savingsGoal') settings.savingsGoal = parseFloat(row[1]) || 0;
    });
    
    // Update local config cache
    config.income = settings.income;
    config.categories = settings.categories;
    config.budgets = settings.budgets;
    config.incomes = settings.incomes;
    config.budgetStartDate = settings.budgetStartDate;
    config.budgetStartDay = settings.budgetStartDay;
    config.savingsGoal = settings.savingsGoal;
    saveConfig(config);

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  const config = loadConfig();
  if (!config.refresh_token || !config.spreadsheetId) {
    // Save locally if not connected
    if (req.body.income !== undefined) config.income = req.body.income;
    if (req.body.categories !== undefined) config.categories = req.body.categories;
    if (req.body.budgets !== undefined) config.budgets = req.body.budgets;
    if (req.body.incomes !== undefined) config.incomes = req.body.incomes;
    if (req.body.budgetStartDate !== undefined) config.budgetStartDate = req.body.budgetStartDate;
    if (req.body.budgetStartDay !== undefined) config.budgetStartDay = req.body.budgetStartDay;
    if (req.body.savingsGoal !== undefined) config.savingsGoal = req.body.savingsGoal;
    saveConfig(config);
    return res.json({ success: true });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials({ refresh_token: config.refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    await ensureSettingsSheet(sheets, config.spreadsheetId);
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: 'הגדרות!A2:B',
    });
    const rows = response.data.values || [];
    
    let currentIncome = '11000';
    let currentCategories = '["מזון וצריכה", "מסעדות ובתי קפה", "תחבורה ורכבים", "דלק, חשמל וגז", "ביטוח", "עירייה וממשלה", "פנאי ובידור", "אופנה וביגוד", "עיצוב הבית", "חשמל ומחשבים", "שונות", "מעשרות"]';
    let currentBudgets = '{}';
    let currentIncomes = JSON.stringify([{ id: '1', name: 'הכנסה שלי', amount: 11000 }]);
    let currentBudgetStartDate = new Date().toISOString().slice(0, 7);
    let currentBudgetStartDay = '10';
    let currentSavingsGoal = '0.25';
    
    rows.forEach(row => {
      if (row[0] === 'income') currentIncome = row[1];
      if (row[0] === 'categories') currentCategories = row[1];
      if (row[0] === 'budgets') currentBudgets = row[1];
      if (row[0] === 'incomes') currentIncomes = row[1];
      if (row[0] === 'budgetStartDate') currentBudgetStartDate = row[1];
      if (row[0] === 'budgetStartDay') currentBudgetStartDay = row[1];
      if (row[0] === 'savingsGoal') currentSavingsGoal = row[1];
    });
    
    if (req.body.income !== undefined) currentIncome = req.body.income.toString();
    if (req.body.categories !== undefined) currentCategories = JSON.stringify(req.body.categories);
    if (req.body.budgets !== undefined) currentBudgets = JSON.stringify(req.body.budgets);
    if (req.body.incomes !== undefined) currentIncomes = JSON.stringify(req.body.incomes);
    if (req.body.budgetStartDate !== undefined) currentBudgetStartDate = req.body.budgetStartDate;
    if (req.body.budgetStartDay !== undefined) currentBudgetStartDay = req.body.budgetStartDay.toString();
    if (req.body.savingsGoal !== undefined) currentSavingsGoal = req.body.savingsGoal.toString();
    
    const values = [
      ['income', currentIncome],
      ['categories', currentCategories],
      ['budgets', currentBudgets],
      ['incomes', currentIncomes],
      ['budgetStartDate', currentBudgetStartDate],
      ['budgetStartDay', currentBudgetStartDay],
      ['savingsGoal', currentSavingsGoal]
    ];
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.spreadsheetId,
      range: 'הגדרות!A2:B8',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values }
    });
    
    // Update local config cache
    if (req.body.income !== undefined) config.income = req.body.income;
    if (req.body.categories !== undefined) config.categories = req.body.categories;
    if (req.body.budgets !== undefined) config.budgets = req.body.budgets;
    if (req.body.incomes !== undefined) config.incomes = req.body.incomes;
    if (req.body.budgetStartDate !== undefined) config.budgetStartDate = req.body.budgetStartDate;
    if (req.body.budgetStartDay !== undefined) config.budgetStartDay = req.body.budgetStartDay;
    if (req.body.savingsGoal !== undefined) config.savingsGoal = req.body.savingsGoal;
    saveConfig(config);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

app.get('/api/expenses', async (req, res) => {
  const config = loadConfig();
  if (!config.refresh_token || !config.spreadsheetId) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials({ refresh_token: config.refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: 'הוצאות!A2:F',
    });

    const rows = response.data.values || [];
    const expenses = rows.map(row => ({
      id: row[0],
      date: row[1],
      name: row[2],
      amount: parseFloat(row[3]),
      type: row[4] === 'קבועה' ? 'fixed' : 'variable',
      category: row[5] || 'שונות'
    })).reverse();

    res.json({ expenses });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.post('/api/expenses', async (req, res) => {
  const config = loadConfig();
  if (!config.refresh_token || !config.spreadsheetId) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials({ refresh_token: config.refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const { id, date, name, amount, type, category } = req.body;
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: config.spreadsheetId,
      range: 'הוצאות!A:F',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[id, date, name, amount, type === 'fixed' ? 'קבועה' : 'משתנה', category || 'שונות']]
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Sheets Error:', error);
    res.status(500).json({ error: 'Failed to sync to Google Sheets' });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  const config = loadConfig();
  if (!config.refresh_token || !config.spreadsheetId) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials({ refresh_token: config.refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: 'הוצאות!A:A',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === req.params.id);

    if (rowIndex !== -1) {
      const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId: config.spreadsheetId });
      const sheetId = sheetInfo.data.sheets?.[0]?.properties?.sheetId || 0;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: config.spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'ROWS',
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1
                }
              }
            }
          ]
        }
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Error:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

app.delete('/api/expenses', async (req, res) => {
  const config = loadConfig();
  if (!config.refresh_token || !config.spreadsheetId) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials({ refresh_token: config.refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    await sheets.spreadsheets.values.clear({
      spreadsheetId: config.spreadsheetId,
      range: 'הוצאות!A2:F',
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear Error:', error);
    res.status(500).json({ error: 'Failed to clear expenses' });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  const config = loadConfig();
  if (!config.refresh_token || !config.spreadsheetId) {
    return res.status(401).json({ error: 'Not connected' });
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials({ refresh_token: config.refresh_token });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.spreadsheetId,
      range: 'הוצאות!A:A',
    });

    const rows = response.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === req.params.id);

    if (rowIndex !== -1) {
      const { date, name, amount, type, category } = req.body;
      await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `הוצאות!A${rowIndex + 1}:F${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[req.params.id, date, name, amount, type === 'fixed' ? 'קבועה' : 'משתנה', category || 'שונות']]
        }
      });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Update Error:', error);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
