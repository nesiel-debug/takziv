const text = `10/03/2026
דירקט
252.56
₪3,173.46
##
2
10/03/2026
דירקט
30.78
₪3,426.02
##
2
09/03/2026
דירקט
137.78
₪3,456.80
##
2
01/02/2026
משרד החינוך
255.04
₪14,404.54
##
1
28/11/2025
העב' לאחר-נייד
170,000.00
₪36,230.56
##
2`;

const fullText = text.split('\n').map(s => s.trim()).filter(s => s).join(' ');
const parts = fullText.split(/(\d{2}[/-]\d{2}[/-]\d{2,4})/);

for (let j = 1; j < parts.length; j += 2) {
  const dateStr = parts[j];
  const rest = parts[j + 1] || '';
  
  const hapoalimMatch = rest.match(/^\s+(.+?)\s+([\d,]+\.\d{2})\s+[₪-]*[\d,]+\.\d{2}(?:\s*##)?\s+([12])/);
  
  let name = '';
  let amount = 0;
  let isIncome = false;
  
  if (hapoalimMatch) {
    name = hapoalimMatch[1].trim();
    amount = parseFloat(hapoalimMatch[2].replace(/,/g, ''));
    isIncome = hapoalimMatch[3] === '1';
    console.log(`[HAPOALIM] Date: ${dateStr}, Name: ${name}, Amount: ${amount}, isIncome: ${isIncome}`);
  } else {
    const genericMatch = rest.match(/^\s+(.+?)\s+([\d,]+\.\d{2})/);
    if (genericMatch) {
      name = genericMatch[1].trim();
      amount = parseFloat(genericMatch[2].replace(/,/g, ''));
      console.log(`[GENERIC] Date: ${dateStr}, Name: ${name}, Amount: ${amount}`);
    } else {
      console.log(`[FAILED] Date: ${dateStr}, Rest: ${rest.substring(0, 20)}...`);
    }
  }
}
