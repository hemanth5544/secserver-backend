import db from "../index.js";

export const deviceStatus = (req, res) => {
  const userId = req.userId;
  

  if (!userId) {
    return res.status(400).json({ error: "User ID   required" });
  }

  db.all(
    'SELECT * FROM devices WHERE user_id = ?',
    [userId],
    (err, devices) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: "Database error" });
      }

      if (!devices || devices.length === 0) {
        return res.status(404).json({ message: "No devices found for this user" });
      }

      res.status(200).json({ devices });
    }
  );
};