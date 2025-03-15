import { accessSync } from "fs";
import db from "../index.js";
import path from 'path';
import bcrypt from "bcryptjs";
import { error } from "console";



export const user= async (req, res) => {
    db.get(
      'SELECT id, email, twoFactorEnabled ,profileImage, name, created_at FROM users WHERE id = ?',
      [req.user.userId],
      (err, user) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        console.log(err)
        res.json(user);
      }
    );
  };


  export const getLastActivity = (req, res) => {
    console.log(req.user.userId);
  
    db.get('SELECT browser_info, status,ip_address FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1 OFFSET 1', [req.user.userId], (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Server error while retrieving last activity from sessions' });
      }
  
      if (!row) {
        return res.status(200).json({ msg: 'No session found for the user' });
      }
  
      return res.json({ lastActivity: row });
    });
  };
  
  export const getActiveSessions = (req, res) => {
    console.log(req.user.userId);
  
    db.all('SELECT  * FROM sessions WHERE user_id = ? AND status = ? ORDER BY created_at DESC', 
      [req.user.userId, 'active'], (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Server error while retrieving active sessions' });
        }
  
        if (rows.length === 0) {
          return res.status(404).json({ error: 'No active sessions found for the user' });
        }
  
        return res.json({ activeSessions: rows });
      });
  };
  
  
  export const updateUserProfile = (req, res) => {
    const { name } = req.body;
    const profileImage = req.file ? `/uploads/profiles/${req.file.filename}` : null;  
  
    const userId = req.userId;  
    console.log(userId,"userIDDDDDDD")

    console.log('Request body:', req.body);  
    console.log('Profile image path:', profileImage);  
  
    if (!name && !profileImage) {
      return res.status(400).json({ message: 'No profile data to update' });
    }

    let query = 'UPDATE users SET';
    const params = [];

    if (name) {
        query += ' name = ?';
        params.push(name);
    }

    if (profileImage) {
        if (params.length > 0) query += ',';
        query += ' profileImage = ?';
        params.push(profileImage);
    }

    query += ' WHERE id = ?';
    params.push(userId);

    db.run(query, params, function (err) {
      if (err) {
        return res.status(500).json({ message: 'Failed to update profile', error: err });
      }
      if (this.changes === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
  
      res.status(200).json({ message: 'Profile updated successfully' });
    });
  };
  

  export const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId; 
    if(currentPassword==newPassword){
      return res.status(400).json({ error: "Pookie both are same"})
    }
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password required" });
    }
  
    db.get("SELECT password FROM users WHERE id = ?", [userId], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: "Server error" });
      }
  
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
  
      try {
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
  
        const hashedPassword = await bcrypt.hash(newPassword, 10);
  
        db.run(
          "UPDATE users SET password = ? WHERE id = ?",
          [hashedPassword, userId],
          function(err) {
            if (err) {
              return res.status(500).json({ error: "Error updating password" });
            }
  
            if (this.changes === 0) {
              return res.status(400).json({ error: "Password update failed" });
            }
  
            res.json({ message: "Password updated successfully" });
          }
        );
      } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: "Server error" });
      }
    });
  };