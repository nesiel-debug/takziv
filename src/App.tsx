import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, TrendingUp, Wallet, Home, CreditCard, Coffee, Target, Zap, FileSpreadsheet, ExternalLink, Settings, X, Upload, Lightbulb, TrendingDown, Award, Search } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type ExpenseType = 'fixed' | 'variable';

interface Expense {
  id: string;
  name: string;
  amount: number;
  type: ExpenseType;
  date: string;
  category?: string;
}

interface IncomeSource {
  id: string;
  name: string;
  amount: number;
}

const QUICK_CATEGORIES = [
  { name: 'סופרמרקט', category: 'מזון וצריכה', icon: CreditCard, color: 'bg-blue-100 text-blue-600' },
  { name: 'דלק', category: 'דלק, חשמל וגז', icon: Zap, color: 'bg-orange-100 text-orange-600' },
  { name: 'מסעדה/קפה', category: 'מסעדות, קפה וברים', icon: Coffee, color: 'bg-amber-100 text-amber-600' },
  { name: 'קניות', category: 'שונות', icon: Wallet, color: 'bg-purple-100 text-purple-600' },
];

const generateAutoBudgets = (income: number, savingsGoal: number, currentCategories: string[]) => {
  const targetBudget = income * (1 - savingsGoal);
  
  const weights: Record<string, number> = {
    'מזון וצריכה': 0.25,
    'תחבורה ורכבים': 0.15,
    'דלק, חשמל וגז': 0.10,
    'עירייה וממשלה': 0.10,
    'ביטוח': 0.05,
    'מסעדות, קפה וברים': 0.05,
    'פנאי, בידור וספורט': 0.05,
    'אופנה': 0.05,
    'עיצוב הבית': 0.05,
    'חשמל ומחשבים': 0.05,
    'מעשרות': 0.05,
    'שונות': 0.05
  };

  let totalWeight = 0;
  currentCategories.forEach(cat => {
    totalWeight += weights[cat] || 0.05;
  });

  const newBudgets: Record<string, number> = {};
  let allocated = 0;
  
  currentCategories.forEach(cat => {
    const weight = weights[cat] || 0.05;
    const normalizedWeight = weight / totalWeight;
    let amount = Math.round((targetBudget * normalizedWeight) / 50) * 50;
    newBudgets[cat] = amount;
    allocated += amount;
  });

  if (currentCategories.length > 0) {
    let largestCat = currentCategories[0];
    for (const cat of currentCategories) {
      if (newBudgets[cat] > newBudgets[largestCat]) {
        largestCat = cat;
      }
    }
    const diff = targetBudget - allocated;
    const roundedDiff = Math.round(diff / 50) * 50;
    newBudgets[largestCat] = Math.max(0, newBudgets[largestCat] + roundedDiff);
  }

  return newBudgets;
};

export default function App() {
  const [userName, setUserName] = useState(localStorage.getItem('userName') || '');
  const [showNamePrompt, setShowNamePrompt] = useState(!localStorage.getItem('userName'));
  const [nameInput, setNameInput] = useState('');

  const [incomes, setIncomes] = useState<IncomeSource[]>([{ id: '1', name: 'הכנסה שלי', amount: 15000 }]);
  const [budgetStartDate, setBudgetStartDate] = useState<string>(new Date().toISOString().slice(0, 7));
  const [budgetStartDay, setBudgetStartDay] = useState<number>(10);
  
  const getBudgetMonth = useCallback((dateString: string) => {
    const d = new Date(dateString);
    let year = d.getFullYear();
    let month = d.getMonth() + 1;
    if (d.getDate() < budgetStartDay) {
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    return `${year}-${month.toString().padStart(2, '0')}`;
  }, [budgetStartDay]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1;
    if (now.getDate() < 10) {
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    return `${year}-${month.toString().padStart(2, '0')}`;
  });
  
  const [savingsGoal, setSavingsGoal] = useState<number>(0.25);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [uncategorizedImports, setUncategorizedImports] = useState<Expense[]>([]);
  const [showTour, setShowTour] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryDetails, setSelectedCategoryDetails] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>(['מזון וצריכה', 'מסעדות, קפה וברים', 'תחבורה ורכבים', 'דלק, חשמל וגז', 'ביטוח', 'עירייה וממשלה', 'פנאי, בידור וספורט', 'אופנה', 'עיצוב הבית', 'חשמל ומחשבים', 'שונות', 'מעשרות']);
  const [budgets, setBudgets] = useState<Record<string, number>>(() => generateAutoBudgets(15000, 0.25, ['מזון וצריכה', 'מסעדות, קפה וברים', 'תחבורה ורכבים', 'דלק, חשמל וגז', 'ביטוח', 'עירייה וממשלה', 'פנאי, בידור וספורט', 'אופנה', 'עיצוב הבית', 'חשמל ומחשבים', 'שונות', 'מעשרות']));
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newType, setNewType] = useState<ExpenseType>('variable');
  const [newCategory, setNewCategory] = useState('שונות');

  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<string>('');
  const [editType, setEditType] = useState<ExpenseType>('variable');

  useEffect(() => {
    checkGoogleStatus();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        setIsGoogleConnected(true);
        if (event.data.spreadsheetUrl) {
          setSpreadsheetUrl(event.data.spreadsheetUrl);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchExpenses = async () => {
    try {
      const res = await fetch('/api/expenses');
      if (res.ok) {
        const data = await res.json();
        if (data.expenses) {
          setExpenses(data.expenses);
        }
      }
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.incomes) {
          setIncomes(settingsData.incomes);
        } else if (settingsData.income) {
          setIncomes([{ id: '1', name: 'הכנסה שלי', amount: settingsData.income }]);
        }
        if (settingsData.budgetStartDate) {
          setBudgetStartDate(settingsData.budgetStartDate);
        }
        if (settingsData.budgetStartDay) {
          setBudgetStartDay(settingsData.budgetStartDay);
        }
        if (settingsData.savingsGoal !== undefined) {
          setSavingsGoal(settingsData.savingsGoal);
        }
        if (settingsData.categories) {
          setCategories(settingsData.categories);
        }
        if (settingsData.budgets && Object.keys(settingsData.budgets).length > 0) {
          setBudgets(settingsData.budgets);
        } else {
          // Generate auto budgets if none exist
          const incomeAmount = settingsData.incomes ? settingsData.incomes.reduce((s: number, i: any) => s + i.amount, 0) : (settingsData.income || 15000);
          const goal = settingsData.savingsGoal !== undefined ? settingsData.savingsGoal : 0.25;
          const cats = settingsData.categories || categories;
          setBudgets(generateAutoBudgets(incomeAmount, goal, cats));
        }
      }
    } catch (e) {
      console.error('Failed to fetch data', e);
    }
  };

  const checkGoogleStatus = async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const text = await res.text();
      if (!text) return;
      
      try {
        const data = JSON.parse(text);
        setIsGoogleConnected(data.connected);
        if (data.spreadsheetUrl) {
          setSpreadsheetUrl(data.spreadsheetUrl);
        }
        if (data.connected) {
          fetchExpenses();
        }
      } catch (e) {
        console.error('Failed to parse JSON response', e);
      }
    } catch (e) {
      console.error('Failed to check status', e);
    }
  };

  const connectGoogleSheets = async () => {
    try {
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      
      if (!res.ok) {
        if (data.error === 'MISSING_CREDENTIALS') {
          alert('שגיאה: חסרים מפתחות התחברות לגוגל (Client ID / Secret). אנא הוסף אותם בהגדרות האפליקציה (Settings -> Secrets) ונסה שוב.');
          return;
        }
        throw new Error('Failed to get auth URL');
      }
      
      window.open(data.url, 'oauth_popup', 'width=600,height=700');
    } catch (e) {
      alert('שגיאה בהתחברות לגוגל שיטס');
    }
  };

  const disconnectGoogleSheets = async () => {
    try {
      await fetch('/api/auth/disconnect', { method: 'POST' });
      setIsGoogleConnected(false);
      setSpreadsheetUrl(null);
    } catch (e) {
      console.error('Failed to disconnect', e);
    }
  };

  const handleAddExpense = async (e?: React.FormEvent, quickName?: string, quickAmount?: number, quickCategory?: string) => {
    if (e) e.preventDefault();
    
    const name = quickName || newName;
    const amount = quickAmount || parseFloat(newAmount);
    let category = quickCategory || newCategory;
    
    if (name.includes('תרומה') || name.includes('מעשר') || name.includes('צדקה') || name.includes('תרומות')) {
      category = 'מעשרות';
    }

    if (!name || isNaN(amount) || amount <= 0) return;
    
    const expense: Expense = {
      id: Date.now().toString(),
      name: name,
      amount: amount,
      type: quickName ? 'variable' : newType,
      date: new Date().toISOString(),
      category: category
    };
    
    setExpenses([expense, ...expenses]);
    
    if (!quickName) {
      setNewName('');
      setNewAmount('');
    }
    
    if (isGoogleConnected) {
      try {
        await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(expense)
        });
      } catch (e) {
        console.error('Failed to sync expense', e);
      }
    }
  };

  const deleteExpense = async (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
    
    if (isGoogleConnected) {
      try {
        await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to delete expense', e);
      }
    }
  };

  const resetExpenses = async () => {
    if (!window.confirm("האם אתה בטוח שברצונך למחוק את כל ההוצאות? פעולה זו אינה הפיכה.")) return;
    
    setExpenses([]);
    
    if (isGoogleConnected) {
      try {
        await fetch('/api/expenses', { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to clear expenses', e);
      }
    }
  };

  const startEditingExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setEditCategory(expense.category || 'שונות');
    setEditType(expense.type);
  };

  const saveEditedExpense = async (expense: Expense) => {
    const updatedExpense = { ...expense, category: editCategory, type: editType };
    setExpenses(expenses.map(e => e.id === expense.id ? updatedExpense : e));
    setEditingExpenseId(null);

    if (isGoogleConnected) {
      try {
        await fetch(`/api/expenses/${expense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedExpense)
        });
      } catch (e) {
        console.error('Failed to update expense', e);
      }
    }
  };

  const saveSettings = async (
    newCategories = categories, 
    newBudgets = budgets, 
    newIncomes = incomes, 
    newStartDate = budgetStartDate,
    newStartDay = budgetStartDay,
    newSavingsGoal = savingsGoal
  ) => {
    if (isGoogleConnected) {
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            categories: newCategories, 
            budgets: newBudgets,
            incomes: newIncomes,
            budgetStartDate: newStartDate,
            budgetStartDay: newStartDay,
            savingsGoal: newSavingsGoal
          })
        });
      } catch (e) {
        console.error('Failed to save settings', e);
      }
    }
  };

  const handleBudgetChange = (category: string, value: string) => {
    const num = parseFloat(value);
    const newBudgets = { ...budgets, [category]: isNaN(num) ? 0 : num };
    setBudgets(newBudgets);
    saveSettings(categories, newBudgets, incomes, budgetStartDate);
  };

  const addCategory = () => {
    if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
      const newCategories = [...categories, newCategoryName.trim()];
      setCategories(newCategories);
      setNewCategoryName('');
      saveSettings(newCategories, budgets, incomes, budgetStartDate);
    }
  };

  const removeCategory = (cat: string) => {
    const newCategories = categories.filter(c => c !== cat);
    setCategories(newCategories);
    const newBudgets = { ...budgets };
    delete newBudgets[cat];
    setBudgets(newBudgets);
    saveSettings(newCategories, newBudgets, incomes, budgetStartDate);
  };

  const handleIncomeChange = (id: string, field: 'name' | 'amount', value: string) => {
    const newIncomes = incomes.map(inc => {
      if (inc.id === id) {
        return { ...inc, [field]: field === 'amount' ? (parseFloat(value) || 0) : value };
      }
      return inc;
    });
    setIncomes(newIncomes);
  };

  const addIncome = () => {
    const newIncomes = [...incomes, { id: Date.now().toString(), name: 'הכנסה חדשה', amount: 0 }];
    setIncomes(newIncomes);
  };

  const removeIncome = (id: string) => {
    const newIncomes = incomes.filter(inc => inc.id !== id);
    setIncomes(newIncomes);
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (nameInput.trim()) {
      localStorage.setItem('userName', nameInput.trim());
      setUserName(nameInput.trim());
      setShowNamePrompt(false);
      setShowTour(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const processData = async (rows: any[][]) => {
      const newExpenses: Expense[] = [];
      
      // Find the actual header row index (usually row 3 or 4, containing 'תאריך עסקה')
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(10, rows.length); i++) {
        if (rows[i] && rows[i].some && rows[i].some((cell: any) => cell && typeof cell === 'string' && cell.includes('תאריך עסקה'))) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        alert('לא נמצאה שורת כותרות תקינה בקובץ (חסרה עמודת "תאריך עסקה").');
        return;
      }

      const headers = rows[headerRowIndex];
      
      // Find column indices
      const dateIdx = headers.findIndex((h: any) => h && typeof h === 'string' && h.includes('תאריך עסקה'));
      const nameIdx = headers.findIndex((h: any) => h && typeof h === 'string' && h.includes('שם בית העסק'));
      const amountIdx = headers.findIndex((h: any) => h && typeof h === 'string' && h.includes('סכום חיוב'));
      const originalAmountIdx = headers.findIndex((h: any) => h && typeof h === 'string' && h.includes('סכום עסקה מקורי'));
      const categoryIdx = headers.findIndex((h: any) => h && typeof h === 'string' && h.includes('קטגוריה'));
      const typeIdx = headers.findIndex((h: any) => h && typeof h === 'string' && h.includes('סוג עסקה'));
      const notesIdx = headers.findIndex((h: any) => h && typeof h === 'string' && h.includes('הערות'));

      if (dateIdx === -1 || nameIdx === -1 || (amountIdx === -1 && originalAmountIdx === -1)) {
        alert('חסרות עמודות חובה בקובץ (תאריך, שם עסק או סכום).');
        return;
      }

      // Parse data rows
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length <= Math.max(dateIdx, nameIdx)) continue;

        let dateStr = row[dateIdx];
        const name = row[nameIdx];
        let amountStr = amountIdx !== -1 ? row[amountIdx] : '';
        const originalAmountStr = originalAmountIdx !== -1 ? row[originalAmountIdx] : '';
        
        // Fallback to original amount if charge amount is empty
        if (amountStr === undefined || amountStr === null || amountStr.toString().trim() === '') {
          amountStr = originalAmountStr;
        }

        const originalCategory = categoryIdx !== -1 ? row[categoryIdx] : '';
        const typeStr = typeIdx !== -1 ? row[typeIdx] : '';
        const notesStr = notesIdx !== -1 ? row[notesIdx] : '';
        
        if (!dateStr || !name || amountStr === undefined || amountStr === null || amountStr === '') continue;

        // Handle Excel date numbers if applicable
        if (typeof dateStr === 'number') {
          // Excel dates are days since 1900-01-01
          const date = new Date((dateStr - (25567 + 2)) * 86400 * 1000);
          dateStr = `${date.getDate().toString().padStart(2, '0')}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getFullYear()}`;
        }

        const amount = parseFloat(amountStr.toString().replace(/[^0-9.-]+/g, ''));
        
        if (!isNaN(amount) && amount !== 0) {
          let parsedDate = new Date().toISOString().split('T')[0];
          // Parse DD-MM-YYYY or DD/MM/YYYY
          const parts = dateStr.toString().split(/[-/]/);
          if (parts.length === 3) {
            // Handle cases where year comes first (YYYY-MM-DD)
            if (parts[0].length === 4) {
              parsedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
              parsedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }

          // Map original categories to our app's categories
          let mappedCategory = originalCategory || 'שונות';
          if (!mappedCategory) mappedCategory = 'שונות';

          const nameStr = name.toString().trim();
          if (nameStr.includes('תרומה') || nameStr.includes('מעשר') || nameStr.includes('צדקה') || nameStr.includes('תרומות')) {
            mappedCategory = 'מעשרות';
          }

          // Determine if fixed or variable based on notes or type
          let expenseType: ExpenseType = 'variable';
          if ((notesStr && notesStr.toString().includes('הוראת קבע')) || 
              (typeStr && typeStr.toString().includes('הוראת קבע')) || 
              (originalCategory && (originalCategory.toString().includes('ביטוח') || originalCategory.toString().includes('עירייה')))) {
            expenseType = 'fixed';
          }

          const expenseObj = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: name.toString().trim(),
            amount,
            type: expenseType,
            date: parsedDate,
            category: mappedCategory.toString()
          };

          if (!categories.includes(expenseObj.category)) {
            expenseObj.category = 'שונות'; // Fallback
            // Add to uncategorized list for review
            setUncategorizedImports(prev => [...prev, expenseObj]);
          }

          newExpenses.push(expenseObj);
        }
      }

      if (newExpenses.length > 0) {
        setExpenses(prev => {
          const updated = [...prev, ...newExpenses];
          return updated;
        });
        
        if (isGoogleConnected) {
          try {
            for (const exp of newExpenses) {
              await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exp)
              });
            }
          } catch (e) {
            console.error('Failed to sync imported expenses to Google Sheets', e);
          }
        }
        alert(`יובאו ${newExpenses.length} הוצאות בהצלחה! המערכת זיהתה אוטומטית את החודשים לפי התאריכים בקובץ.`);
      } else {
        alert('לא נמצאו הוצאות חדשות לייבוא בקובץ.');
      }
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    if (file.name.toLowerCase().endsWith('.csv')) {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data as any[][]);
        },
        error: (error) => {
          alert('שגיאה בקריאת הקובץ: ' + error.message);
        }
      });
    } else if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          processData(rows);
        } catch (error) {
          console.error('Error parsing Excel file:', error);
          alert('שגיאה בקריאת קובץ האקסל. אנא ודא שהקובץ תקין.');
        }
      };
      reader.onerror = () => {
        alert('שגיאה בקריאת הקובץ.');
      };
      reader.readAsBinaryString(file);
    } else if (file.name.toLowerCase().endsWith('.pdf')) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target?.result as ArrayBuffer);
          const pdf = await pdfjsLib.getDocument(typedarray).promise;
          const newExpenses: Expense[] = [];
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            
            const fullText = textContent.items.map((item: any) => item.str.trim()).filter((s: string) => s).join(' ');
            const parts = fullText.split(/(\d{2}[/-]\d{2}[/-]\d{2,4})/);
            
            for (let j = 1; j < parts.length; j += 2) {
              const dateStr = parts[j];
              const rest = parts[j + 1] || '';
              
              // Try Bank Hapoalim format first
              const hapoalimMatch = rest.match(/^\s+(.+?)\s+([\d,]+\.\d{2})\s+[₪-]*[\d,]+\.\d{2}(?:\s*##)?\s+([12])/);
              
              let name = '';
              let amount = 0;
              let isIncome = false;
              
              if (hapoalimMatch) {
                name = hapoalimMatch[1].trim();
                amount = parseFloat(hapoalimMatch[2].replace(/,/g, ''));
                isIncome = hapoalimMatch[3] === '1';
              } else {
                // Generic fallback
                const genericMatch = rest.match(/^\s+(.+?)\s+([\d,]+\.\d{2})/);
                if (genericMatch) {
                  name = genericMatch[1].trim();
                  amount = parseFloat(genericMatch[2].replace(/,/g, ''));
                } else {
                  continue; // Could not parse
                }
              }
              
              if (isIncome) continue; // Skip incomes for now, as the app tracks expenses
              
              if (!name) name = 'הוצאה מ-PDF';
              
              // Parse date
              let parsedDate = new Date().toISOString().split('T')[0];
              const dateParts = dateStr.split(/[-/]/);
              if (dateParts.length === 3) {
                let year = dateParts[2];
                if (year.length === 2) year = '20' + year;
                parsedDate = `${year}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
              }
              
              // Determine category (default to uncategorized)
              let mappedCategory = 'שונות';
              if (name.includes('תרומה') || name.includes('מעשר') || name.includes('צדקה')) {
                mappedCategory = 'מעשרות';
              }
              
              newExpenses.push({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                name: name,
                amount: amount,
                type: 'variable',
                date: parsedDate,
                category: mappedCategory
              });
            }
          }
          
          if (newExpenses.length > 0) {
            setExpenses(prev => [...prev, ...newExpenses]);
            
            // Collect uncategorized
            const uncategorized = newExpenses.filter(e => e.category === 'שונות');
            if (uncategorized.length > 0) {
              setUncategorizedImports(uncategorized);
            }
            
            if (isGoogleConnected) {
              try {
                const response = await fetch('/api/expenses', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ expenses: newExpenses })
                });
                if (!response.ok) {
                  console.error('Failed to sync imported expenses to Google Sheets');
                }
              } catch (e) {
                console.error('Failed to sync imported expenses to Google Sheets', e);
              }
            }
            alert(`יובאו ${newExpenses.length} הוצאות בהצלחה מקובץ ה-PDF! המערכת זיהתה אוטומטית את החודשים לפי התאריכים בקובץ.`);
          } else {
            alert('לא נמצאו הוצאות בקובץ ה-PDF. ייתכן שהפורמט אינו נתמך.');
          }
          
        } catch (error) {
          console.error('Error parsing PDF file:', error);
          alert('שגיאה בקריאת קובץ ה-PDF. אנא ודא שהקובץ תקין.');
        }
      };
      reader.onerror = () => {
        alert('שגיאה בקריאת הקובץ.');
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('פורמט קובץ לא נתמך. אנא העלה קובץ CSV, Excel (.xlsx, .xls) או PDF.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const totalIncome = incomes.reduce((sum, inc) => sum + inc.amount, 0);
  const targetSavings = totalIncome * savingsGoal;
  const baseTargetBudget = totalIncome - targetSavings;

  const effectiveTargetBudget = useMemo(() => {
    const [startYear, startM] = budgetStartDate.split('-').map(Number);
    const [endYear, endM] = selectedMonth.split('-').map(Number);
    let monthsElapsed = (endYear - startYear) * 12 + (endM - startM) + 1;
    if (monthsElapsed < 1) monthsElapsed = 1;

    const pastSpent = expenses
      .filter(e => {
        const expMonth = getBudgetMonth(e.date);
        return expMonth >= budgetStartDate && expMonth < selectedMonth;
      })
      .reduce((sum, e) => sum + e.amount, 0);

    const carryOver = (baseTargetBudget * (monthsElapsed - 1)) - pastSpent;
    return baseTargetBudget + carryOver;
  }, [baseTargetBudget, expenses, budgetStartDate, selectedMonth, getBudgetMonth]);

  const currentMonthExpenses = useMemo(() => 
    expenses.filter(e => getBudgetMonth(e.date) === selectedMonth)
  , [expenses, selectedMonth, getBudgetMonth]);

  const effectiveBudgets = useMemo(() => {
    const firstMonthUsedByCategory = expenses.reduce((acc, exp) => {
      const expMonth = getBudgetMonth(exp.date);
      if (!acc[exp.category] || expMonth < acc[exp.category]) {
        acc[exp.category] = expMonth;
      }
      return acc;
    }, {} as Record<string, string>);

    const [endYear, endM] = selectedMonth.split('-').map(Number);
    const newBudgets: Record<string, number> = {};
    
    for (const cat of Object.keys(budgets)) {
      const baseBudget = budgets[cat] || 0;
      
      let catStartMonth = budgetStartDate;
      if (firstMonthUsedByCategory[cat] && firstMonthUsedByCategory[cat] > budgetStartDate) {
        catStartMonth = firstMonthUsedByCategory[cat];
      }
      if (!firstMonthUsedByCategory[cat]) {
        catStartMonth = selectedMonth;
      }

      const [startYear, startM] = catStartMonth.split('-').map(Number);
      let monthsElapsed = (endYear - startYear) * 12 + (endM - startM) + 1;
      
      if (monthsElapsed < 1) monthsElapsed = 1;

      const pastSpent = expenses
        .filter(e => e.category === cat)
        .filter(e => {
          const expMonth = getBudgetMonth(e.date);
          return expMonth >= catStartMonth && expMonth < selectedMonth;
        })
        .reduce((sum, e) => sum + e.amount, 0);

      const carryOver = (baseBudget * (monthsElapsed - 1)) - pastSpent;
      newBudgets[cat] = baseBudget + carryOver;
    }
    return newBudgets;
  }, [budgets, expenses, budgetStartDate, selectedMonth, getBudgetMonth]);

  const fixedExpensesTotal = useMemo(() => 
    currentMonthExpenses.filter(e => e.type === 'fixed').reduce((acc, curr) => acc + curr.amount, 0)
  , [currentMonthExpenses]);

  const variableExpensesTotal = useMemo(() => 
    currentMonthExpenses.filter(e => e.type === 'variable').reduce((acc, curr) => acc + curr.amount, 0)
  , [currentMonthExpenses]);

  const availableForVariable = effectiveTargetBudget - fixedExpensesTotal;
  const remainingVariable = availableForVariable - variableExpensesTotal;
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(amount);
  };

  const fixedPercentage = effectiveTargetBudget > 0 ? (fixedExpensesTotal / effectiveTargetBudget) * 100 : 0;
  const variablePercentage = effectiveTargetBudget > 0 ? (variableExpensesTotal / effectiveTargetBudget) * 100 : 0;
  const savingsPercentage = totalIncome > 0 ? (targetSavings / totalIncome) * 100 : 0;
  
  // Calculate how much of the *allowed* budget is used
  const budgetUsedPercentage = effectiveTargetBudget > 0 ? ((fixedExpensesTotal + variableExpensesTotal) / effectiveTargetBudget) * 100 : 0;

  // Calculate months elapsed for budget accumulation
  const start = new Date(budgetStartDate + '-01T00:00:00Z');
  const now = new Date();
  const monthsElapsed = Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1);

  const insights = useMemo(() => {
    if (currentMonthExpenses.length === 0) return null;

    // Top categories
    const categoryTotals = currentMonthExpenses.reduce((acc, exp) => {
      if (exp.type === 'variable') {
        acc[exp.category || 'שונות'] = (acc[exp.category || 'שונות'] || 0) + exp.amount;
      }
      return acc;
    }, {} as Record<string, number>);

    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    // Average daily spending
    const dates = currentMonthExpenses.map(e => new Date(e.date).getTime()).filter(t => !isNaN(t));
    let daysDiff = 1;
    if (dates.length > 1) {
      const minDate = Math.min(...dates);
      const maxDate = Math.max(...dates);
      daysDiff = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));
    }
    
    const totalVariable = currentMonthExpenses.filter(e => e.type === 'variable').reduce((sum, e) => sum + e.amount, 0);
    const avgDaily = totalVariable / daysDiff;

    // Highest expense
    const highestExpense = [...currentMonthExpenses].sort((a, b) => b.amount - a.amount)[0];

    return { topCategories, avgDaily, highestExpense, daysDiff };
  }, [currentMonthExpenses]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const lowerQuery = searchQuery.toLowerCase();
    return expenses.filter(e => 
      e.name.toLowerCase().includes(lowerQuery) || 
      (e.category && e.category.toLowerCase().includes(lowerQuery))
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans" dir="rtl">
      {/* Uncategorized Imports Modal */}
      {uncategorizedImports.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" dir="rtl">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">הוצאות ללא קטגוריה 🏷️</h2>
            <p className="text-slate-600 mb-6">
              מצאנו {uncategorizedImports.length} הוצאות מקובץ הייבוא שלא זיהינו להן קטגוריה. אנא בחר קטגוריה מתאימה לכל אחת.
            </p>
            <div className="space-y-4 mb-6">
              {uncategorizedImports.map((exp, index) => (
                <div key={exp.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 gap-4">
                  <div>
                    <div className="font-medium text-slate-900">{exp.name}</div>
                    <div className="text-sm text-slate-500">{exp.date} • {formatCurrency(exp.amount)}</div>
                  </div>
                  <select
                    value={exp.category}
                    onChange={(e) => {
                      const newCategory = e.target.value;
                      setUncategorizedImports(prev => prev.map((item, i) => i === index ? { ...item, category: newCategory } : item));
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[150px]"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setUncategorizedImports([])}
                className="px-6 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl font-medium transition-colors"
              >
                דלג
              </button>
              <button
                onClick={() => {
                  setExpenses(prev => prev.map(exp => {
                    const uncategorizedMatch = uncategorizedImports.find(u => u.id === exp.id);
                    return uncategorizedMatch ? { ...exp, category: uncategorizedMatch.category } : exp;
                  }));
                  setUncategorizedImports([]);
                }}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
              >
                שמור קטגוריות
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name Prompt Modal */}
      {showNamePrompt && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" dir="rtl">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">ברוך הבא! 👋</h2>
            <p className="text-slate-600 mb-6">איך קוראים לך?</p>
            <form onSubmit={handleNameSubmit} className="space-y-4">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="הכנס את שמך..."
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                autoFocus
              />
              <button
                type="submit"
                disabled={!nameInput.trim()}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl font-medium transition-colors"
              >
                המשך
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600">
            <Wallet className="w-6 h-6" />
            <h1 className="text-xl font-bold">ניהול תקציב ביתי</h1>
          </div>
          <div className="flex items-center gap-4">
            {userName && <span className="text-slate-600 font-medium hidden sm:inline">שלום, {userName}</span>}
            
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              title="בחר חודש"
            />
            
            <div className="relative">
              <input 
                type="file" 
                accept=".csv,.xlsx,.xls,.pdf" 
                onChange={handleFileUpload} 
                ref={fileInputRef}
                className="hidden" 
                id="csv-upload"
              />
              <label 
                htmlFor="csv-upload"
                className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                title="ייבוא מקובץ CSV/Excel/PDF"
              >
                <Upload className="w-5 h-5" />
                <span className="text-sm hidden sm:inline">ייבוא</span>
              </label>
            </div>

            <button 
              onClick={() => setShowTour(true)}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1"
              title="סיור במערכת"
            >
              <span className="text-sm hidden sm:inline font-medium">איך זה עובד?</span>
            </button>

            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="הגדרות"
            >
              <Settings className="w-5 h-5" />
            </button>
            {isGoogleConnected ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                  <FileSpreadsheet className="w-4 h-4" />
                  מחובר ל-Sheets
                </span>
                {spreadsheetUrl && (
                  <a href={spreadsheetUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 p-1" title="פתח גיליון">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button 
                  onClick={disconnectGoogleSheets}
                  className="text-xs text-slate-500 hover:text-red-500 mr-2 underline"
                >
                  התנתק
                </button>
              </div>
            ) : (
              <button 
                onClick={connectGoogleSheets}
                className="text-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                חבר ל-Google Sheets
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Search Bar */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="חיפוש הוצאות לפי שם או קטגוריה..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none focus:ring-0 outline-none text-slate-700 placeholder:text-slate-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quick Add Section */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            הוספה מהירה
          </h2>
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="w-full md:w-1/3">
              <input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                placeholder="הזן סכום (₪)"
                className="w-full text-2xl text-center px-4 py-4 border-2 border-indigo-100 rounded-xl focus:ring-0 focus:border-indigo-500 outline-none transition-all font-bold text-indigo-900"
              />
            </div>
            <div className="w-full md:w-2/3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {QUICK_CATEGORIES.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => handleAddExpense(undefined, cat.name, parseFloat(newAmount), cat.category)}
                  disabled={!newAmount || isNaN(Number(newAmount)) || Number(newAmount) <= 0}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border border-transparent transition-all
                    ${(!newAmount || isNaN(Number(newAmount)) || Number(newAmount) <= 0) 
                      ? 'bg-slate-50 text-slate-400 cursor-not-allowed' 
                      : `${cat.color} hover:shadow-md hover:scale-105 cursor-pointer`}`}
                >
                  <cat.icon className="w-6 h-6 mb-1" />
                  <span className="text-sm font-medium">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {searchQuery ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500" />
              תוצאות חיפוש ({searchResults.length})
            </h2>
            <div className="space-y-3">
              {searchResults.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  לא נמצאו הוצאות התואמות לחיפוש "{searchQuery}"
                </div>
              ) : (
                searchResults.map(expense => (
                  <div key={expense.id} className="flex flex-col p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => editingExpenseId !== expense.id && startEditingExpense(expense)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${expense.type === 'fixed' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                          {expense.type === 'fixed' ? <Home className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                        </div>
                        <div>
                          <div className="font-medium text-slate-900">{expense.name}</div>
                          <div className="text-sm text-slate-500 flex items-center gap-2">
                            <span>{expense.date}</span>
                            <span>•</span>
                            <span className="bg-slate-100 px-2 py-0.5 rounded-full text-xs">{expense.category || 'שונות'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-bold text-slate-900">
                          {formatCurrency(expense.amount)}
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeExpense(expense.id); }}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    {editingExpenseId === expense.id && (
                      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3" onClick={e => e.stopPropagation()}>
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="flex-1 rounded-lg border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        >
                          <option value="">בחר קטגוריה</option>
                          {categories.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <select
                          value={editType}
                          onChange={(e) => setEditType(e.target.value as ExpenseType)}
                          className="flex-1 rounded-lg border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        >
                          <option value="variable">הוצאה משתנה</option>
                          <option value="fixed">הוצאה קבועה</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEditedExpense(expense.id)}
                            className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors"
                          >
                            שמור
                          </button>
                          <button
                            onClick={() => setEditingExpenseId(null)}
                            className="flex-1 sm:flex-none px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 text-sm font-medium transition-colors"
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Top Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Income Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-600">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h2 className="font-medium">הכנסה חודשית כוללת</h2>
              </div>
            </div>
            
            <div className="text-3xl font-bold text-slate-900">
              {formatCurrency(totalIncome)}
            </div>
            <p className="text-sm text-slate-500 mt-2">
              יעד חיסכון: {formatCurrency(targetSavings)}
            </p>
          </div>

          {/* Savings Goal Card */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-slate-600">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Target className="w-5 h-5" />
                </div>
                <h2 className="font-medium">יעד חיסכון ({Math.round(savingsGoal * 100)}%)</h2>
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900">
              {formatCurrency(targetSavings)}
            </div>
            <p className="text-sm text-slate-500 mt-2">
              תקציב מותר להוצאות: {formatCurrency(effectiveTargetBudget)}
            </p>
          </div>

          {/* Remaining for Variable Card */}
          <div className={`${remainingVariable < 0 ? 'bg-rose-600' : 'bg-indigo-600'} rounded-2xl p-6 shadow-sm text-white flex flex-col justify-between relative overflow-hidden transition-colors`}>
            <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full -translate-x-16 -translate-y-16 blur-2xl"></div>
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="flex items-center gap-2 text-white/90">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Wallet className="w-5 h-5" />
                </div>
                <h2 className="font-medium">נותר להוצאות משתנות</h2>
              </div>
            </div>
            <div className="text-3xl font-bold relative z-10">
              {formatCurrency(remainingVariable)}
            </div>
            <p className="text-sm text-white/80 mt-2 relative z-10">
              {availableForVariable < 0 
                ? 'ההוצאות הקבועות חורגות מהתקציב!' 
                : `מתוך ${formatCurrency(availableForVariable)} פנויים`}
            </p>
          </div>
        </div>

        {/* Budget Progress Bar */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <div className="flex justify-between items-end mb-4">
            <h3 className="text-sm font-medium text-slate-700">ניצול תקציב מותר ({formatCurrency(effectiveTargetBudget)})</h3>
            <span className={`text-sm font-bold ${budgetUsedPercentage > 100 ? 'text-rose-600' : 'text-slate-600'}`}>
              {budgetUsedPercentage.toFixed(1)}%
            </span>
          </div>
          <div className="h-4 flex rounded-full overflow-hidden bg-slate-100 relative">
            {/* Target Line */}
            <div className="absolute top-0 bottom-0 w-0.5 bg-slate-800 z-10" style={{ right: '100%' }} title="יעד תקציב"></div>
            
            <div 
              style={{ width: `${Math.min(100, (fixedExpensesTotal / effectiveTargetBudget) * 100 || 0)}%` }} 
              className="bg-rose-500 transition-all duration-500"
              title={`קבועות: ${formatCurrency(fixedExpensesTotal)}`}
            ></div>
            <div 
              style={{ width: `${Math.min(100, (variableExpensesTotal / effectiveTargetBudget) * 100 || 0)}%` }} 
              className="bg-amber-400 transition-all duration-500"
              title={`משתנות: ${formatCurrency(variableExpensesTotal)}`}
            ></div>
          </div>
          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-rose-500"></div> קבועות</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-amber-400"></div> משתנות</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></div> נותר מהתקציב</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Add Expense Form (Manual) */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 sticky top-24">
              <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                הוספה ידנית
              </h2>
              
              <form onSubmit={(e) => handleAddExpense(e)} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם ההוצאה</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="לדוגמה: קניות בסופר"
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">סכום (₪)</label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">קטגוריה</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">סוג הוצאה</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewType('fixed')}
                      className={`py-2 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2
                        ${newType === 'fixed' 
                          ? 'bg-rose-50 border-rose-200 text-rose-700' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Home className="w-4 h-4" />
                      קבועה
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewType('variable')}
                      className={`py-2 px-4 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2
                        ${newType === 'variable' 
                          ? 'bg-amber-50 border-amber-200 text-amber-700' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      <Coffee className="w-4 h-4" />
                      משתנה
                    </button>
                  </div>
                </div>
                
                <button
                  type="submit"
                  disabled={!newName || !newAmount}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-colors mt-2 flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  הוסף הוצאה
                </button>
              </form>
            </div>
          </div>

          {/* Expenses Lists */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Insights Section */}
            {insights && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500" />
                  תובנות וניתוח נתונים
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Top Categories */}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 mb-3 flex items-center gap-1">
                      <TrendingDown className="w-4 h-4" />
                      הקטגוריות הבזבזניות ביותר
                    </h3>
                    <div className="space-y-3">
                      {insights.topCategories.map(([cat, amount], index) => (
                        <div key={cat} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-medium">
                              {index + 1}
                            </span>
                            <span className="font-medium text-slate-700">{cat}</span>
                          </div>
                          <span className="text-slate-900 font-semibold">{formatCurrency(amount)}</span>
                        </div>
                      ))}
                      {insights.topCategories.length === 0 && (
                        <p className="text-sm text-slate-500">אין מספיק נתונים להצגה.</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Quick Stats */}
                  <div className="space-y-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-500 mb-1">ממוצע הוצאות יומי (משתנות)</h3>
                      <div className="text-2xl font-bold text-slate-900">{formatCurrency(insights.avgDaily)}</div>
                      <p className="text-xs text-slate-500 mt-1">מחושב על פני {insights.daysDiff} ימים</p>
                    </div>
                    
                    {insights.highestExpense && (
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-500 mb-1 flex items-center gap-1">
                          <Award className="w-4 h-4 text-rose-500" />
                          ההוצאה הגדולה ביותר
                        </h3>
                        <div className="text-lg font-bold text-slate-900">{formatCurrency(insights.highestExpense.amount)}</div>
                        <p className="text-sm text-slate-600 mt-1">{insights.highestExpense.name} <span className="text-slate-400 text-xs">({insights.highestExpense.date})</span></p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Category Budgets */}
            {Object.keys(effectiveBudgets).length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-500" />
                  ניצול תקציב לפי קטגוריה
                </h2>
                <div className="space-y-4">
                  {Object.entries(effectiveBudgets).map(([cat, budget]) => {
                    const totalBudget = budget;
                    const spent = currentMonthExpenses.filter(e => e.category === cat).reduce((acc, curr) => acc + curr.amount, 0);
                    const percentage = totalBudget > 0 ? (spent / totalBudget) * 100 : 0;
                    const isOver = spent > totalBudget;
                    
                    return (
                      <div 
                        key={cat} 
                        className="space-y-1 cursor-pointer hover:bg-slate-50 p-2 -mx-2 rounded-lg transition-colors"
                        onClick={() => setSelectedCategoryDetails(cat)}
                      >
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-slate-700">{cat}</span>
                          <span className="text-slate-500">
                            <span className={isOver ? 'text-rose-600 font-bold' : 'text-slate-900 font-medium'}>
                              נוצל: {formatCurrency(spent)}
                            </span>
                            {' '} | {' '}
                            <span className={isOver ? 'text-rose-600 font-medium' : 'text-emerald-600 font-medium'}>
                              נותר: {formatCurrency(totalBudget - spent)}
                            </span>
                          </span>
                        </div>
                        <div className="h-2 flex rounded-full overflow-hidden bg-slate-100">
                          <div 
                            style={{ width: `${Math.min(100, percentage)}%` }} 
                            className={`transition-all duration-500 ${isOver ? 'bg-rose-500' : 'bg-indigo-500'}`}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Variable Expenses */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-2 h-6 bg-amber-400 rounded-full"></div>
                  הוצאות משתנות (שוטפות)
                </h2>
                <div className="text-lg font-bold text-amber-600">
                  {formatCurrency(variableExpensesTotal)}
                </div>
              </div>
              
              <div className="space-y-3">
                {currentMonthExpenses.filter(e => e.type === 'variable').length === 0 ? (
                  <div className="text-center py-8 text-slate-500 flex flex-col items-center">
                    <Coffee className="w-8 h-8 mb-2 opacity-50" />
                    <p>אין הוצאות משתנות עדיין בחודש זה</p>
                  </div>
                ) : (
                  currentMonthExpenses.filter(e => e.type === 'variable').map(expense => (
                    <div key={expense.id} className="flex flex-col p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => editingExpenseId !== expense.id && startEditingExpense(expense)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                            <CreditCard className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{expense.name}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(expense.date).toLocaleDateString('he-IL')}
                              {expense.category && ` • ${expense.category}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-slate-900">{formatCurrency(expense.amount)}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id); }}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover:opacity-100"
                            title="מחק הוצאה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {editingExpenseId === expense.id && (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3" onClick={e => e.stopPropagation()}>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="flex-1 rounded-lg border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                          >
                            <option value="">בחר קטגוריה</option>
                            {categories.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as ExpenseType)}
                            className="flex-1 rounded-lg border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                          >
                            <option value="variable">הוצאה משתנה</option>
                            <option value="fixed">הוצאה קבועה</option>
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEditedExpense(expense)}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                            >
                              שמור
                            </button>
                            <button
                              onClick={() => setEditingExpenseId(null)}
                              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Fixed Expenses */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-2 h-6 bg-rose-500 rounded-full"></div>
                  הוצאות קבועות
                </h2>
                <div className="text-lg font-bold text-rose-600">
                  {formatCurrency(fixedExpensesTotal)}
                </div>
              </div>
              
              <div className="space-y-3">
                {currentMonthExpenses.filter(e => e.type === 'fixed').length === 0 ? (
                  <div className="text-center py-8 text-slate-500 flex flex-col items-center">
                    <Home className="w-8 h-8 mb-2 opacity-50" />
                    <p>אין הוצאות קבועות עדיין בחודש זה</p>
                  </div>
                ) : (
                  currentMonthExpenses.filter(e => e.type === 'fixed').map(expense => (
                    <div key={expense.id} className="flex flex-col p-4 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => editingExpenseId !== expense.id && startEditingExpense(expense)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                            <Home className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{expense.name}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(expense.date).toLocaleDateString('he-IL')}
                              {expense.category && ` • ${expense.category}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-semibold text-slate-900">{formatCurrency(expense.amount)}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id); }}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-1 opacity-0 group-hover:opacity-100"
                            title="מחק הוצאה"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      
                      {editingExpenseId === expense.id && (
                        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3" onClick={e => e.stopPropagation()}>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="flex-1 rounded-lg border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                          >
                            <option value="">בחר קטגוריה</option>
                            {categories.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as ExpenseType)}
                            className="flex-1 rounded-lg border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                          >
                            <option value="variable">הוצאה משתנה</option>
                            <option value="fixed">הוצאה קבועה</option>
                          </select>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEditedExpense(expense)}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                            >
                              שמור
                            </button>
                            <button
                              onClick={() => setEditingExpenseId(null)}
                              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
                            >
                              ביטול
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
        </>
        )}
      </main>

      {/* Tour Modal */}
      {showTour && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <span className="text-2xl">🚀</span>
                ברוכים הבאים למערכת ניהול התקציב!
              </h2>
              <button onClick={() => setShowTour(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 text-slate-700">
              <div className="flex gap-4 items-start">
                <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl shrink-0"><Zap className="w-6 h-6" /></div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 mb-1">הוספה מהירה</h3>
                  <p>בראש העמוד תמצאו את אזור ההוספה המהירה. פשוט מקלידים סכום ולוחצים על הקטגוריה המתאימה. ההוצאה תתווסף מיד!</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl shrink-0"><Target className="w-6 h-6" /></div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 mb-1">תקציב אוטומטי חכם</h3>
                  <p>בהגדרות (גלגל השיניים למעלה), תוכלו להגדיר את ההכנסות שלכם ואת יעד החיסכון באחוזים. המערכת תחלק אוטומטית את התקציב הנותר בין הקטגוריות השונות בצורה חכמה.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-xl shrink-0"><Upload className="w-6 h-6" /></div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 mb-1">ייבוא מקובץ אקסל/CSV</h3>
                  <p>ניתן לייבא קבצי פירוט אשראי. המערכת תזהה אוטומטית את התאריכים, הסכומים והקטגוריות. הוצאות שלא זוהו יוקפצו לכם למיון מהיר ונוח.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="p-3 bg-amber-100 text-amber-600 rounded-xl shrink-0"><FileSpreadsheet className="w-6 h-6" /></div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900 mb-1">סנכרון ל-Google Sheets</h3>
                  <p>חברו את המערכת לחשבון הגוגל שלכם, וכל ההוצאות וההגדרות יישמרו אוטומטית בגיליון אקסל בענן, כך שהמידע שלכם תמיד מגובה וזמין.</p>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setShowTour(false)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors"
              >
                הבנתי, בואו נתחיל!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Details Modal */}
      {selectedCategoryDetails && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                פירוט הוצאות: {selectedCategoryDetails}
              </h2>
              <button onClick={() => setSelectedCategoryDetails(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {(() => {
                const categoryExpenses = currentMonthExpenses.filter(e => e.category === selectedCategoryDetails);
                if (categoryExpenses.length === 0) {
                  return <p className="text-slate-500 text-center py-8">אין הוצאות בקטגוריה זו החודש.</p>;
                }
                return categoryExpenses.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <div className="font-medium text-slate-900">{exp.name}</div>
                      <div className="text-sm text-slate-500">{exp.date}</div>
                    </div>
                    <div className="font-bold text-slate-900">{formatCurrency(exp.amount)}</div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                הגדרות ותקציבים
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-8">
              {/* Income & Savings */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900 border-b pb-2">הגדרות כלליות</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      יעד חיסכון: {Math.round(savingsGoal * 100)}%
                    </label>
                    <input
                      type="range"
                      dir="ltr"
                      min="0"
                      max="1"
                      step="0.05"
                      value={savingsGoal}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setSavingsGoal(val);
                        const newBudgets = generateAutoBudgets(totalIncome, val, categories);
                        setBudgets(newBudgets);
                        saveSettings(categories, newBudgets, incomes, budgetStartDate, budgetStartDay, val);
                      }}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">חודש תחילת תקציב</label>
                    <input
                      type="month"
                      value={budgetStartDate}
                      onChange={(e) => {
                        setBudgetStartDate(e.target.value);
                        saveSettings(categories, budgets, incomes, e.target.value);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">יום תחילת חודש</label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={budgetStartDay}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setBudgetStartDay(val);
                        saveSettings(categories, budgets, incomes, budgetStartDate, val);
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Incomes */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900 border-b pb-2">מקורות הכנסה</h3>
                <div className="space-y-3">
                  {incomes.map(inc => (
                    <div key={inc.id} className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={inc.name}
                          onChange={(e) => handleIncomeChange(inc.id, 'name', e.target.value)}
                          placeholder="שם ההכנסה (למשל: משכורת שלי)"
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        />
                        <div className="w-32 relative">
                          <input
                            type="number"
                            value={inc.amount || ''}
                            onChange={(e) => {
                              handleIncomeChange(inc.id, 'amount', e.target.value);
                              const updatedIncomes = incomes.map(i => i.id === inc.id ? { ...i, amount: parseFloat(e.target.value) || 0 } : i);
                              saveSettings(categories, budgets, updatedIncomes, budgetStartDate, budgetStartDay, savingsGoal);
                            }}
                            placeholder="סכום"
                            className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₪</span>
                        </div>
                        <button 
                          onClick={() => removeIncome(inc.id)}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors bg-white border border-slate-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="pt-2">
                        <input
                          type="range"
                          dir="ltr"
                          min="5000"
                          max="30000"
                          step="500"
                          value={inc.amount}
                          onChange={(e) => {
                            handleIncomeChange(inc.id, 'amount', e.target.value);
                            const updatedIncomes = incomes.map(i => i.id === inc.id ? { ...i, amount: parseFloat(e.target.value) || 0 } : i);
                            saveSettings(categories, budgets, updatedIncomes, budgetStartDate, budgetStartDay, savingsGoal);
                          }}
                          className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                          <span>5,000 ₪</span>
                          <span>30,000 ₪</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button 
                    onClick={addIncome}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף מקור הכנסה
                  </button>
                </div>
              </div>

              {/* Categories & Budgets */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h3 className="font-semibold text-slate-900">קטגוריות ותקציבים</h3>
                  <div className="text-sm">
                    <span className="text-slate-500">תקציב מוקצה: </span>
                    <span className={`font-medium ${Object.values(budgets).reduce((a, b) => a + b, 0) > baseTargetBudget ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {formatCurrency(Object.values(budgets).reduce((a, b) => a + b, 0))}
                    </span>
                    <span className="text-slate-500"> מתוך {formatCurrency(baseTargetBudget)}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center gap-3">
                      <div className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                        {cat}
                      </div>
                      <div className="w-32 relative">
                        <input
                          type="number"
                          placeholder="תקציב"
                          value={budgets[cat] || ''}
                          onChange={(e) => handleBudgetChange(cat, e.target.value)}
                          className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">₪</span>
                      </div>
                      <button 
                        onClick={() => removeCategory(cat)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="text"
                      placeholder="הוסף קטגוריה חדשה..."
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                    />
                    <button 
                      onClick={addCategory}
                      className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg font-medium transition-colors"
                    >
                      הוסף
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between items-center">
              <button 
                onClick={resetExpenses}
                className="px-4 py-2 text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100 font-medium transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                איפוס כל ההוצאות
              </button>
              <button 
                onClick={() => {
                  saveSettings(categories, budgets, incomes, budgetStartDate);
                  setIsSettingsOpen(false);
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors"
              >
                שמור וסיים
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
