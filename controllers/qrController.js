const crypto = require('crypto');
const QRCode = require('qrcode');
const prisma = require('../config/prisma');

const getBaseFrontendUrl = (req) => {
  // 1. Explicit FRONTEND_URL env var if not localhost
  if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')) {
    return process.env.FRONTEND_URL.replace(/\/$/, '');
  }

  // 2. Origin header (POST/CORS)
  if (req?.headers?.origin && !req.headers.origin.includes('localhost')) {
    return req.headers.origin.replace(/\/$/, '');
  }

  // 3. Referer header (GET requests from browser)
  if (req?.headers?.referer) {
    try {
      const url = new URL(req.headers.referer);
      if (!url.origin.includes('localhost')) {
        return url.origin;
      }
    } catch (e) {}
  }

  // 4. Host header from Vercel reverse proxy
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
  if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    const proto = req?.headers?.['x-forwarded-proto'] || 'https';
    return `${proto}://${host}`;
  }

  // 5. Default Production Vercel URL fallback
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return 'https://attendence-and-payroll-management-s-sigma.vercel.app';
  }

  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
};

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

    const frontendBaseUrl = getBaseFrontendUrl(req);
    const scanUrl = `${frontendBaseUrl}/scan/${qr_token}`;
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

    const frontendBaseUrl = getBaseFrontendUrl(req);
    const scanUrl = `${frontendBaseUrl}/scan/${activeQR.qr_token}`;
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
