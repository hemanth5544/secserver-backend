import jwt from 'jsonwebtoken';
import db from '../index.js'
import client from '../db/redisClient.js';
import {isRedisAvailable} from '../util.js'
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access denied' });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'mrbean');
    req.user = verified;
    req.userId=verified.userId
    next();
  } catch (err) {
    res.status(400).json({ error: 'Invalid token' });
  }
};

export const checkSessionStatus = async (req, res, next) => {
  const sessionId = req.headers['x-session-id'];

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required in the headers' });
  }

  try {
    let sessionData;

    if (await isRedisAvailable()) {
      const redisSessionData = await client.get(`session:${sessionId}`);
      if (redisSessionData) {
        sessionData = JSON.parse(redisSessionData);
      }
    }

    if (!sessionData) {
      const query = 'SELECT * FROM sessions WHERE sessionId = ?';
      const dbSessionData = await new Promise((resolve, reject) => {
        db.get(query, [sessionId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!dbSessionData) {
        return res.status(404).json({ error: 'Session not found' });
      }

      sessionData = {
        userId: dbSessionData.user_id,
        ipAddress: dbSessionData.ip_address,
        browserInfo: dbSessionData.browser_info,
        status: dbSessionData.status,
        createdAt: dbSessionData.createdAt,
      };
    }

    if (sessionData.status !== 'active') {
      return res.status(401).json({ error: 'Session is not active' });
    }

    req.sessionId = sessionId;
    req.user = { userId: sessionData.userId };
    req.sessionData = sessionData;

    next();
  } catch (err) {
    console.error('Error in checkSessionStatus:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};