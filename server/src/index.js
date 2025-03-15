import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit'

import authRoutes from './routes/authRoutes.js';


dotenv.config();

const app = express();
const db = new sqlite3.Database('./hemu.db');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100, 
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

app.use(limiter);
const corsOptions = {
  origin: '*', // allow requests from this origin
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // define the allowed HTTP methods (optional)
  credentials: true, // if you need to support cookies or authentication (optional)
};
app.use(cors(corsOptions));
app.use(cors());
app.use(express.json());
//TODO: last accesced in the device 
//TODO: joined in "DD-MM_YYYY"
// Initialize database
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      twoFactorSecret TEXT,
      twoFactorEnabled INTEGER DEFAULT 0,
      profileImage TEXT,
      name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sessionId TEXT UNIQUE,
      user_id INTEGER NOT NULL,
      ip_address TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      browser_info TEXT NOT NULL,
      status TEXT DEFAULT 'active',  -- Can be 'active' or 'inactive'
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email_notifications_enabled INTEGER DEFAULT 0, -- 0 means disabled, 1 means enabled
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
    db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      fail_attempts INTEGER DEFAULT 0,
      success_attempts INTEGER DEFAULT 0,
      last_attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
      
  );
  `);
  
});

app.use('/api',authRoutes)
app.use('/uploads', express.static('uploads'));  




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


export default db;