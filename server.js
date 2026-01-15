const express = require('express');
const ExcelJS = require('exceljs');
const app = express();

const SUPABASE_URL = 'https://mdrjubmratnoipytpkzi.supabase.co';
const SUPABASE_SERVICE_KEY = 'sb_secret_8HXyZ3UOvpkQDT6mashyAg_NQ6V47dd';

app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

// START PAGE
app.get('/', (req, res) => res.render('start'));

// Kiosk routes
app.get('/ruda', (req, res) => res.render('kiosk', { loc: 'ruda', name: 'Daimler Truck Retail Polska - Ruda Śląska' }));
app.get('/siedlce', (req, res) => res.render('kiosk', { loc: 'siedlce', name: 'Daimler Truck Retail Polska - Siedlce' }));
app.get('/emilianow', (req, res) => res.render('kiosk', { loc: 'emilianow', name: 'Daimler Truck Retail Polska - Emilianów' }));

app.get('/thanks', (req, res) => res.render('thanks', { loc: req.query.loc, rating: req.query.rating }));

app.post('/save', async (req, res) => {
  const { loc, rating, comment } = req.body;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/opinions`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ location: loc, rating, comment, created_at: new Date().toISOString() })
    });
    res.json({ ok: response.ok });
  } catch (e) {
    res.json({ ok: false });
  }
});

// Admin routes
app.get('/admin/login', (req, res) => res.render('login'));

app.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&password=eq.${encodeURIComponent(password)}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const users = await response.json();
    if (users.length > 0) {
      const user = users[0];
      res.json({ 
        ok: true, 
        user: { 
          role: user.role, 
          location: user.location, 
          name: user.name,
          email: user.email
        } 
      });
    } else {
      res.json({ ok: false, msg: 'Nieprawidłowe dane' });
    }
  } catch (e) {
    res.json({ ok: false, msg: 'Błąd serwera' });
  }
});

app.get('/admin', (req, res) => res.render('admin'));

app.get('/admin/stats', async (req, res) => {
  const { location, role } = req.query;
  try {
    let url = `${SUPABASE_URL}/rest/v1/opinions?select=*`;
    
    if (role === 'manager' && location !== 'all') {
      url += `&location=eq.${location}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    
    const data = await response.json();
    const stats = {};
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    data.forEach(opinion => {
      if (!stats[opinion.location]) {
        stats[opinion.location] = {
          location: opinion.location,
          happy: 0, neutral: 0, sad: 0, total: 0,
          today: 0, yesterday: 0
        };
      }
      
      const s = stats[opinion.location];
      s.total++;
      if (opinion.rating === 'happy') s.happy++;
      if (opinion.rating === 'neutral') s.neutral++;
      if (opinion.rating === 'sad') s.sad++;
      
      const date = opinion.created_at.split('T')[0];
      if (date === today) s.today++;
      if (date === yesterday) s.yesterday++;
    });
    
    res.json(Object.values(stats));
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.get('/admin/comments', async (req, res) => {
  const { location } = req.query;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/opinions?location=eq.${location}&order=created_at.desc&limit=50`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.json([]);
  }
});

app.get('/admin/export', async (req, res) => {
  const { location, role } = req.query;
  try {
    let url = `${SUPABASE_URL}/rest/v1/opinions?select=*&order=created_at.desc`;
    
    if (role === 'manager' && location !== 'all') {
      url += `&location=eq.${location}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    
    const data = await response.json();
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Opinie');
    
    worksheet.columns = [
      { header: 'Data', key: 'date', width: 20 },
      { header: 'Lokalizacja', key: 'location', width: 20 },
      { header: 'Ocena', key: 'rating', width: 15 },
      { header: 'Komentarz', key: 'comment', width: 50 }
    ];
    
    data.forEach(opinion => {
      const date = new Date(opinion.created_at);
      const ratingText = opinion.rating === 'happy' ? 'Bardzo dobrze' : 
                         opinion.rating === 'neutral' ? 'W porządku' : 'Źle';
      
      worksheet.addRow({
        date: date.toLocaleString('pl-PL'),
        location: opinion.location,
        rating: ratingText,
        comment: opinion.comment || ''
      });
    });
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=opinie.xlsx');
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/admin/reset', async (req, res) => {
  const { role } = req.body;
  
  if (role !== 'admin') {
    return res.json({ ok: false, msg: 'Brak uprawnień' });
  }
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/opinions?id=gt.0`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    
    res.json({ ok: response.ok });
  } catch (e) {
    res.json({ ok: false, msg: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
