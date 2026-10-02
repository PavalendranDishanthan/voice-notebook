import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { run, all } from './db.js';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }); 

app.post('/api/process-text', async (req, res) => {
  const { text, language, user_id = 'default_user' } = req.body;
  console.log('Received spoken/typed text:', text);

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text required' });
  }

  try {
    const prompt = `You are a helpful assistant for a voice-controlled grocery list app.
The user speaks in ${language === 'ta' ? 'Tamil' : language === 'si' ? 'Sinhala' : 'English'}, but may mix words.
Classify the user's intent from their speech into one of these:
- "navigate": user wants to go to a different tab (to_buy, bought, summary).
- "mark_bought": user indicates they bought a specific item on their list.
- "get_summary": user wants to hear their total spending or summary.
- "get_list": user wants to hear what is currently on their list.
- "add_item": user mentions items they need to buy.

Also extract structured data. Return ONLY valid JSON with this schema:
{
  "intent": "add_item" | "navigate" | "mark_bought" | "get_summary" | "get_list",
  "items": [{"name": "item name", "quantity": "number or string"}], // for add_item
  "target_item": "item name to mark as bought", // for mark_bought
  "target": "to_buy" | "bought" | "summary" // for navigate
}

User's speech: "${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });
    
    let result;
    try {
      result = JSON.parse(response.text);
    } catch(e) {
      console.error('LLM parse error:', e);
      return res.status(500).json({ error: 'Failed to parse LLM response' });
    }
    
    const intent = result.intent;

    if (intent === 'navigate') {
      let speechText = 'Navigating to ' + result.target;
      if (language === 'ta') speechText = 'பக்கத்திற்குச் செல்கிறேன்';
      else if (language === 'si') speechText = 'පිටුවට යමින්';
      return res.json({ type: 'NAVIGATE', intent: 'navigate', target: result.target, speechText });
    }

    if (intent === 'mark_bought' && result.target_item) {
      const toBuy = await all(`SELECT id, item_name FROM items WHERE status = 'to_buy' AND user_id = ?`, [user_id]);
      let markedItem = null;
      for (const item of toBuy) {
        if (item.item_name.toLowerCase().includes(result.target_item.toLowerCase()) || result.target_item.toLowerCase().includes(item.item_name.toLowerCase())) {
          markedItem = item;
          break;
        }
      }

      if (markedItem) {
        await run(`UPDATE items SET status = 'bought', bought_at = CURRENT_TIMESTAMP WHERE id = ?`, [markedItem.id]);
        return res.json({ type: 'MARK_BOUGHT', intent: 'mark_bought', speechText: `Marked ${markedItem.item_name} as bought.` });
      } else {
        return res.json({ type: 'MARK_BOUGHT', intent: 'mark_bought', speechText: `Couldn't find that item to mark as bought.` });
      }
    }

    if (intent === 'get_summary') {
      const totalRes = await all(`SELECT SUM(price) as grand_total FROM items WHERE status = 'bought' AND user_id = ?`, [user_id]);
      const total = totalRes[0]?.grand_total || 0;
      let speechText = `Your total spending is ${total} rupees.`;
      if (language === 'ta') speechText = `உங்கள் மொத்த செலவு ${total} ரூபாய்.`;
      else if (language === 'si') speechText = `ඔබේ මුළු වියදම රුපියල් ${total} යි.`;
      return res.json({ type: 'GET_SUMMARY', speechText, total });
    }
    
    if (intent === 'get_list') {
      const toBuy = await all(`SELECT item_name, quantity FROM items WHERE status = 'to_buy' AND user_id = ?`, [user_id]);
      let speechText = '';
      if (toBuy.length === 0) {
        speechText = 'Your list is empty.';
      } else {
        const itemNames = toBuy.map(i => `${i.quantity} ${i.item_name}`).join(', ');
        speechText = `You need to buy: ${itemNames}.`;
      }
      return res.json({ type: 'GET_LIST', speechText, items: toBuy });
    }

    if (intent === 'add_item' && result.items) {
      for (const entry of result.items) {
        await run(
          `INSERT INTO items (user_id, item_name, quantity, status) VALUES (?, ?, ?, 'to_buy')`,
          [user_id, entry.name, String(entry.quantity)]
        );
      }
      return res.json({ type: 'ADD_ITEMS', itemsAdded: result.items, speechText: `Added ${result.items.length} items to your list.` });
    }

    return res.json({ type: 'UNKNOWN', speechText: "Sorry, I didn't understand that." });

  } catch (err) {
    console.error('Error processing text:', err);
    res.status(500).json({ error: 'Failed to process text' });
  }
});

app.get('/api/items', async (req, res) => {
  const { user_id = 'default_user' } = req.query;
  try {
    const items = await all('SELECT * FROM items WHERE user_id = ? ORDER BY id DESC', [user_id]);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/items/:id/mark-bought', async (req, res) => {
  const { id } = req.params;
  const { price, user_id = 'default_user' } = req.body;
  try {
    await run(
      `UPDATE items 
       SET status = 'bought', 
           price = ?, 
           bought_at = CURRENT_TIMESTAMP 
       WHERE id = ? AND user_id = ?`,
      [price || null, id, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/summary', async (req, res) => {
  const { user_id = 'default_user' } = req.query;
  try {
    const breakdown = await all(`
      SELECT 
        DATE(bought_at) as date,
        item_name, 
        COUNT(*) as total_bought_count, 
        SUM(price) as item_total_spent 
      FROM items 
      WHERE status = 'bought' AND user_id = ?
      GROUP BY date, item_name
      ORDER BY date DESC
    `, [user_id]);
    
    const total = await all(`SELECT SUM(price) as grand_total FROM items WHERE status = 'bought' AND user_id = ?`, [user_id]);
    
    const groupedByDate = {};
    for (const row of breakdown) {
        if (!row.date) continue;
        if (!groupedByDate[row.date]) groupedByDate[row.date] = [];
        groupedByDate[row.date].push(row);
    }

    res.json({
      breakdown: groupedByDate,
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