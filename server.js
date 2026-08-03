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

// Health check - odwiedzany cyklicznie przez zewnętrzny serwis (np. UptimeRobot),
// żeby Render i Supabase nigdy nie usnęły z powodu braku aktywności
app.get('/health', async (req, res) => {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/opinions?select=id&limit=1`, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    });
    res.json({ ok: true, time: new Date().toISOString() });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

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

    const locationNames = {
      ruda: 'Ruda Śląska',
      siedlce: 'Siedlce',
      emilianow: 'Emilianów'
    };

    // Policz oceny dla każdej lokalizacji
    const statsByLocation = {};
    data.forEach(opinion => {
      if (!statsByLocation[opinion.location]) {
        statsByLocation[opinion.location] = { happy: 0, neutral: 0, sad: 0 };
      }
      const s = statsByLocation[opinion.location];
      if (opinion.rating === 'happy') s.happy++;
      if (opinion.rating === 'neutral') s.neutral++;
      if (opinion.rating === 'sad') s.sad++;
    });

    const workbook = new ExcelJS.Workbook();

    // --- ARKUSZ 1: Dane szczegółowe ---
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
        location: locationNames[opinion.location] || opinion.location,
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

    // --- ARKUSZ 2: Wykresy dla każdej lokalizacji ---
    const chartSheet = workbook.addWorksheet('Wykresy');
    let currentRow = 1;

    for (const loc of Object.keys(statsByLocation)) {
      const s = statsByLocation[loc];
      const label = locationNames[loc] || loc;

      chartSheet.getCell(`A${currentRow}`).value = label;
      chartSheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      currentRow += 1;

      const chartConfig = {
        type: 'bar',
        data: {
          labels: ['Bardzo dobrze', 'W porządku', 'Źle'],
          datasets: [{
            label: label,
            data: [s.happy, s.neutral, s.sad],
            backgroundColor: ['#4CAF50', '#FFC107', '#f44336']
          }]
        },
        options: {
          plugins: {
            legend: { display: false },
            title: { display: true, text: `${label} (razem: ${s.happy + s.neutral + s.sad})` }
          }
        }
      };

      const chartUrl = `https://quickchart.io/chart?width=500&height=300&backgroundColor=white&c=${encodeURIComponent(JSON.stringify(chartConfig))}`;

      try {
        const chartResponse = await fetch(chartUrl);
        const chartBuffer = Buffer.from(await chartResponse.arrayBuffer());
        const imageId = workbook.addImage({ buffer: chartBuffer, extension: 'png' });

        chartSheet.addImage(imageId, {
          tl: { col: 0, row: currentRow - 0.1 },
          ext: { width: 500, height: 300 }
        });
      } catch (chartError) {
        chartSheet.getCell(`A${currentRow}`).value = 'Nie udało się wygenerować wykresu';
      }

      currentRow += 17; // odstęp na kolejny wykres
    }

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
