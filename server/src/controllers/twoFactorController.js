import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import db from '../index.js';  

export const enableTwoFactor = async (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.user.userId], async (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'Auth2FA', secret);

    const qrCode = await QRCode.toDataURL(otpauth);

    db.run('UPDATE users SET twoFactorSecret = ? WHERE id = ?', [secret, user.id], (err) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      return res.json({ secret, qrCode });
    });
  });
};



export const verifyTwoFactor =async(req, res) => {
  const { token } = req.body;
  
  db.get('SELECT * FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) return res.status(500).json({ error: 'Server error' });

    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret
    });

    if (isValid) {
      db.run('UPDATE users SET twoFactorEnabled = 1 WHERE id = ?', [user.id], (err) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        res.json({ message: '2FA enabled successfully' });
      });
    } else {
      res.status(400).json({ error: 'Invalid token' });
    }
  });
}




export const disableTwoFactor = async (req, res) => {
  db.run(
    'UPDATE users SET twoFactorEnabled = 0, twoFactorSecret = NULL WHERE id = ?',
    [req.user.userId],
    (err) => {
      if (err) return res.status(500).json({ error: 'Server error' });
      res.json({ message: '2FA disabled successfully' });
    }
  );
};