import db from "../index.js";

export const updateNotificationPreferences = (req, res) => {
  const {  enableNotifications } = req.body;
  const userId=req.user.userId
  
  if (userId == null || enableNotifications == null) {
    return res.status(400).json({ error: "Missing userId or enableNotifications" });
  }

  const query = `
    SELECT * FROM notifications WHERE user_id = ?
  `;
  
  db.get(query, [userId], (err, record) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }

    if (record) {
      const updateQuery = `
        UPDATE notifications
        SET email_notifications_enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `;
      db.run(updateQuery, [enableNotifications ? 1 : 0, userId], (err) => {
        if (err) {
          return res.status(500).json({ error: "Error updating notification preferences" });
        }
        return res.json({ message: "Notification preferences updated successfully" });
      });
    } else {
      const insertQuery = `
        INSERT INTO notifications (user_id, email_notifications_enabled)
        VALUES (?, ?)
      `;
      db.run(insertQuery, [userId, enableNotifications ? 1 : 0], (err) => {
        if (err) {
          return res.status(500).json({ error: "Error setting notification preferences" });
        }
        return res.json({ message: "Notification preferences set successfully" });
      });
    }
  });
};

export const getNotificationStatus = (req, res) => {
  const userId=req.user.userId

  const query = `
    SELECT email_notifications_enabled
    FROM notifications
    WHERE user_id = ?
  `;
  
  db.get(query, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ error: "Database error" });
    }

    if (row) {
      return res.json({ email_notifications_enabled: row.email_notifications_enabled });
    } else {
      return res.json({ msg : "user not enabled" });
    }
  });
};
