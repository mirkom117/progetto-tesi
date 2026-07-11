require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const DatoCertificato = require('./models/DatoCertificato');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/progetto-tesi';

app.use(cors());
app.use(express.json());

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

app.get('/api/dati', async (req, res) => {
  try {
    const dati = await DatoCertificato.find().sort({ timestamp: 1 });
    const cleanDati = dati.map(d => ({
        deviceId: d.deviceId,
        timestamp: d.timestamp,
        tensione: d.tensione,
        armoniche: d.armoniche,
        fileHash: d.fileHash
    }));
    res.json(cleanDati);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/dati', async (req, res) => {
  try {
    const nuovoDato = new DatoCertificato(req.body);
    const salvato = await nuovoDato.save();
    res.status(201).json({
        deviceId: salvato.deviceId,
        timestamp: salvato.timestamp,
        tensione: salvato.tensione,
        armoniche: salvato.armoniche,
        fileHash: salvato.fileHash
    });
  } catch (error) {
    if (error.code === 11000) {      
      res.status(409).json({ error: 'Data with this fileHash already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

app.delete('/api/dati', async (req, res) => {
  try {
    await DatoCertificato.deleteMany({});
    res.status(200).json({ message: 'All data deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
