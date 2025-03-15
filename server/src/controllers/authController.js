import bcrypt from "bcryptjs";
import db from "../index.js";
import { authenticator } from "otplib";
import { generateToken,sendEmail,sendLoginEmail} from "../util.js";
import useragent from "useragent";
import client from "../db/redisClient.js";
import { generateHashedSessionId } from "../util.js";
import {isRedisAvailable} from '../util.js'


//FIXME: Add salt while hasihing and add more sha algo
export const signup = async (req, res) => {
  const { email, password } = req.body;
  console.log(email, password);

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [email, hashedPassword],
      (err) => {
        if (err) {
          return res.status(400).json({ error: "Email already exists" });
        }
        res.json({ message: "User created successfully." });

        const subject = "Signup Notification";
        const name ="hemanth"

        sendEmail(email, subject, name,email).catch((emailError) => {
          console.error("Error sending email:", emailError);
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};


const handleDatabaseError = (res, err) => {
  console.error('Database error:', err);
  return res.status(500).json({ error: 'Database error' });
};

const findUserByEmail = (email, callback) => {
  db.get('SELECT * FROM users WHERE email = ?', [email], callback);
};

const validatePassword = async (password, userPassword) => {
  return await bcrypt.compare(password, userPassword);
};

const validateTwoFactorToken = (token, secret) => {
  return authenticator.verify({ token, secret });
};

const sendLoginNotification = async (email, name) => {
  const subject = 'Login Notification';
  await sendLoginEmail(email, subject, name, email).catch((emailError) => {
    console.error('Error sending email:', emailError);
  });
};

const createSession = async (userId, ipAddress, browserInfo, callback) => {
  const sessionId = generateHashedSessionId();

  const sessionInsertQuery = `
    INSERT INTO sessions (user_id, ip_address, browser_info, status, sessionId) 
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(sessionInsertQuery, [userId, ipAddress, browserInfo, 'active', sessionId], async function (err) {
    if (err) {
      return callback(err);
    }

    const sessionData = {
      userId,
      ipAddress,
      browserInfo,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    if (await isRedisAvailable()) {
      try {
        await client.set(`session:${sessionId}`, JSON.stringify(sessionData), {
          EX: 86400,
        });
        await client.sAdd(`userSessions:${userId}`, sessionId);
        
        return callback(null, sessionId);
      } catch (err) {
        return callback(err); 
      }
    }
    return callback(null, sessionId);
  });
};

const generateDeviceName = (browserInfo, ipAddress) => {
  return `${browserInfo}-${ipAddress}`;
};

const updateDeviceRecord = (userId, deviceName, isSuccess, callback) => {
  db.get(
    'SELECT * FROM devices WHERE user_id = ? AND device_name = ?',
    [userId, deviceName],
    (err, row) => {
      if (err) return callback(err);

      if (row) {
        const updateQuery = `
          UPDATE devices
          SET
            success_attempts = success_attempts + ?,
            fail_attempts = fail_attempts + ?,
            last_attempted_at = CURRENT_TIMESTAMP
          WHERE user_id = ? AND device_name = ?
        `;
        const successAttempts = isSuccess ? 1 : 0;
        const failAttempts = isSuccess ? 0 : 1;
        db.run(updateQuery, [successAttempts, failAttempts, userId, deviceName], callback);
      } else {
        const insertQuery = `
          INSERT INTO devices (user_id, device_name, success_attempts, fail_attempts, last_attempted_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        const successAttempts = isSuccess ? 1 : 0;
        const failAttempts = isSuccess ? 0 : 1;
        db.run(insertQuery, [userId, deviceName, successAttempts, failAttempts], callback);
      }
    }
  );
};

export const login = async (req, res) => {
  const { email, password, token } = req.body;

  try {
    findUserByEmail(email, async (err, user) => {
      
      if (err) return handleDatabaseError(res, err);
      if (!user) return res.status(400).json({ error: 'User not found' });

      const validPassword = await validatePassword(password, user.password);
      if (!validPassword) {

        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
        const agent = useragent.parse(req.headers['user-agent']);
        const browserInfo = ` ${agent.os.family} ${agent.family} `;
        const deviceName = generateDeviceName(browserInfo, ipAddress);

        updateDeviceRecord(user.id, deviceName, false, (err) => {
          if (err) return handleDatabaseError(res, err);
          return res.status(400).json({ error: 'Invalid password' });
        });
        return;
      }

      if (user.twoFactorEnabled) {
        if (!token) return res.status(400).json({ error: '2FA token required' });
        const isValid = validateTwoFactorToken(token, user.twoFactorSecret);
        if (!isValid) {
          const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
          const agent = useragent.parse(req.headers['user-agent']);
          const browserInfo = ` ${agent.os.family} ${agent.family} `;
          const deviceName = generateDeviceName(browserInfo, ipAddress);

          updateDeviceRecord(user.id, deviceName, false, (err) => {
            if (err) return handleDatabaseError(res, err);
            return res.status(400).json({ error: 'Invalid 2FA token' });
          });
          return;
        }
      }

      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
      const agent = useragent.parse(req.headers['user-agent']);
      const browserInfo = ` ${agent.os.family} ${agent.family} `;
      const deviceName = generateDeviceName(browserInfo, ipAddress);

      updateDeviceRecord(user.id, deviceName, true, (err) => {
        if (err) return handleDatabaseError(res, err);

        db.get('SELECT * FROM notifications WHERE user_id = ?', [user.id], async (err, notificationRecord) => {
          if (err) return handleDatabaseError(res, err);
          if (notificationRecord && notificationRecord.email_notifications_enabled) {
            await sendLoginNotification(email, 'user');
          }

         await createSession(user.id, ipAddress, browserInfo, function (err,sessionId) {
            if (err) return handleDatabaseError(res, err);

            const jwtToken = generateToken(user.id);
            res.json({ token: jwtToken, sessionId: sessionId });
          });
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};



export const logout = async (req, res) => {
  const sessionId = req.sessionId;
  const userId = req.user.userId;

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    if (await isRedisAvailable()) {
      await client.del(`session:${sessionId}`);
      await client.sRem(`userSessions:${userId}`, sessionId);
    }
    const updateSessionQuery = 'DELETE FROM sessions WHERE sessionId = ?';
    await new Promise((resolve, reject) => {
      db.run(updateSessionQuery, [sessionId], function (err) {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Error in logout:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logoutAll = async (req, res) => {
  const userId = req.user.userId;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    if (await isRedisAvailable()) {
      const sessionKeys = await client.keys(`session:*`);
      const userSessionKeys = sessionKeys.filter(async (key) => {
        const sessionData = await client.get(key);
        return sessionData && JSON.parse(sessionData).userId === userId;
      });

      if (userSessionKeys.length > 0) {
        await client.del(userSessionKeys);
        await client.del(`userSessions:${userId}`);      }
    }

    const deleteSessionsQuery = 'DELETE FROM sessions WHERE user_id = ?';
    await new Promise((resolve, reject) => {
      db.run(deleteSessionsQuery, [userId], function (err) {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: 'Logged out all devices successfully' });
  } catch (err) {
    console.error('Error in logoutAll:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};