const crypto = require('crypto');
const QRCode = require('qrcode');
const prisma = require('../config/prisma');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Generate new daily QR token (admin)
const generateQR = async (req, res) => {
  try {
    // Deactivate previous active QR tokens
    await prisma.qRCode.updateMany({
      where: { is_active: true },
      data: { is_active: false }
    });

    const qr_token = crypto.randomUUID();
    const now = new Date();
    const expires_at = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours validity

    const newQR = await prisma.qRCode.create({
      data: {
        qr_token,
        generated_date: now,
        expires_at,
        is_active: true
      }
    });

    const scanUrl = `${FRONTEND_URL}/scan/${qr_token}`;
    const qr_image_base64 = await QRCode.toDataURL(scanUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    return res.json({
      message: 'New QR Code generated successfully',
      qr_token: newQR.qr_token,
      expires_at: newQR.expires_at,
      scan_url: scanUrl,
      qr_image_base64
    });
  } catch (error) {
    console.error('Generate QR error:', error);
    return res.status(500).json({ error: 'Failed to generate QR Code.' });
  }
};

// Get today's active QR (admin broadcast screen)
const getTodayQR = async (req, res) => {
  try {
    const now = new Date();

    let activeQR = await prisma.qRCode.findFirst({
      where: {
        is_active: true,
        expires_at: { gt: now }
      },
      orderBy: { generated_date: 'desc' }
    });

    // Auto-generate if no active token exists
    if (!activeQR) {
      const qr_token = crypto.randomUUID();
      const expires_at = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      activeQR = await prisma.qRCode.create({
        data: {
          qr_token,
          generated_date: now,
          expires_at,
          is_active: true
        }
      });
    }

    const scanUrl = `${FRONTEND_URL}/scan/${activeQR.qr_token}`;
    const qr_image_base64 = await QRCode.toDataURL(scanUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    return res.json({
      qr_token: activeQR.qr_token,
      generated_date: activeQR.generated_date,
      expires_at: activeQR.expires_at,
      is_active: activeQR.is_active,
      scan_url: scanUrl,
      qr_image_base64
    });
  } catch (error) {
    console.error('Get today QR error:', error);
    return res.status(500).json({ error: 'Failed to fetch QR Code.' });
  }
};

// Validate QR token (used by mobile scan page)
const validateQRToken = async (req, res) => {
  try {
    const { token } = req.params;
    const now = new Date();

    const qr = await prisma.qRCode.findUnique({
      where: { qr_token: token }
    });

    if (!qr) {
      return res.status(404).json({ valid: false, error: 'QR Code not found or invalid.' });
    }

    if (!qr.is_active || qr.expires_at <= now) {
      return res.status(400).json({ valid: false, error: 'QR Code has expired or is inactive.' });
    }

    return res.json({
      valid: true,
      qr_token: qr.qr_token,
      expires_at: qr.expires_at
    });
  } catch (error) {
    console.error('Validate QR error:', error);
    return res.status(500).json({ valid: false, error: 'Server error during QR validation.' });
  }
};

module.exports = {
  generateQR,
  getTodayQR,
  validateQRToken
};
