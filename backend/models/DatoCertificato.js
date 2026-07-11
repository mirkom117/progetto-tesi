const mongoose = require('mongoose');

const DatoCertificatoSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true
  },
  timestamp: {
    type: String,
    required: true
  },
  tensione: {
    type: Number,
    required: true
  },
  armoniche: {
    type: Object,
    required: true
  },
  fileHash: {
    type: String,
    required: true,
    unique: true
  }
}, { timestamps: true });

module.exports = mongoose.model('DatoCertificato', DatoCertificatoSchema);
