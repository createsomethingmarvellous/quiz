import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    const { durationSeconds = 120 } = req.body || {}; // default 2 minutes
    await sql`
      CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL,
        end_time TIMESTAMP
      );
    `;
    const endTime = new Date(Date.now() + durationSeconds * 1000);
    await sql`
      INSERT INTO QuizStatus (id, started, end_time)
      VALUES (1, TRUE, ${endTime.toISOString()})
      ON CONFLICT (id) DO UPDATE SET started = TRUE, end_time = ${endTime.toISOString()};
    `;
    res.status(200).json({ message: 'Quiz started', endTime });
  } catch (error) {
    res.status(500).json({ message: 'Failed', error: String(error) });
  }
}
