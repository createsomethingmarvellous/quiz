import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  try {
    const { rows } = await sql`
      SELECT team_name, score FROM Scores ORDER BY score DESC, submitted_at ASC
    `;
    res.status(200).json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed', error: String(error) });
  }
}
