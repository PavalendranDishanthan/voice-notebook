import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import { run, all } from './db.js';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors({ origin: '*' }));
app.use(express.json());

// Dictionary mapping Tamil, Sinhala, and common words to numbers
const NUMBER_MAP = {
  // Tamil numbers & colloquial variants
  'ஒன்று': '1', 'ஒன்னு': '1', 'ஒரு': '1',
  'இரண்டு': '2', 'ரெண்டு': '2', 'இரு': '2',
  'மூன்று': '3', 'மூணு': '3',
  'நான்கு': '4', 'நாலு': '4',
  'ஐந்து': '5', 'அஞ்சு': '5',
  'ஆறு': '6',
  'ஏழு': '7',
  'எட்டு': '8',
  'ஒன்பது': '9',
  'பத்து': '10',
  // Sinhala numbers
  'එක': '1', 'දෙක': '2', 'තුන': '3', 'හතර': '4', 'පහ': '5',
  // English words
  'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5'
};

// Robust multilingual local parser
function parseItemsMultilingual(text) {
  if (!text) return [];
  
  // Clean punctuation and suffix attachments like "வாழைப்பழமும்" -> "வாழைப்பழம்"
  let cleanText = text
    .replace(/[.,!?]/g, '')
    .replace(/மும்\b|வும்\b/g, '') // remove Tamil conjunction suffixes (-um)
    .trim();

  // Split multiple items joined by 'and', 'மற்றும்', commas, or 'හා'
  const phrases = cleanText.split(/,|\band\b|மற்றும்|හා/i);
  const results = [];

  for (let phrase of phrases) {
    phrase = phrase.trim();
    if (!phrase) continue;

    const words = phrase.split(/\s+/);
    let quantity = '1';
    let itemWords = [];

    for (let word of words) {
      const lower = word.toLowerCase();
      if (!isNaN(word)) {
        quantity = word;
      } else if (NUMBER_MAP[lower]) {
        quantity = NUMBER_MAP[lower];
      } else {
        itemWords.push(word);
      }
    }

    const itemName = itemWords.join(' ').trim();
    if (itemName) {
      results.push({
        item: itemName,
        quantity: quantity
      });
    } else if (phrase) {
      results.push({
        item: phrase,
        quantity: '1'
      });
    }
  }

  return results.length > 0 ? results : [{ item: text.trim(), quantity: '1' }];
}

// 1. Process Text / Transcribed Speech
app.post('/api/process-text', async (req, res) => {
  const { text } = req.body;
  console.log('Received spoken/typed text:', text);

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text required' });
  }

  try {
    const items = parseItemsMultilingual(text);
    console.log('Extracted Items:', items);

    for (const entry of items) {
      await run(
        `INSERT INTO items (item_name, quantity, status) VALUES (?, ?, 'to_buy')`,
        [entry.item, String(entry.quantity)]
      );
    }

    res.json({ itemsAdded: items });
  } catch (err) {
    console.error('Error saving item:', err);
    res.status(500).json({ error: 'Failed to save items' });
  }
});

// 2. Fetch all items
app.get('/api/items', async (req, res) => {
  try {
    const items = await all('SELECT * FROM items ORDER BY id DESC');
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Mark bought with price
app.patch('/api/items/:id/mark-bought', async (req, res) => {
  const { id } = req.params;
  const { price } = req.body;
  try {
    await run(
      `UPDATE items 
       SET status = 'bought', 
           price = ?, 
           bought_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [price || null, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Summary report
app.get('/api/summary', async (req, res) => {
  try {
    const breakdown = await all(`
      SELECT 
        item_name, 
        COUNT(*) as total_bought_count, 
        SUM(price) as item_total_spent 
      FROM items 
      WHERE status = 'bought' 
      GROUP BY item_name
    `);
    const total = await all(`SELECT SUM(price) as grand_total FROM items WHERE status = 'bought'`);
    res.json({
      breakdown,
      grandTotal: total[0]?.grand_total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});