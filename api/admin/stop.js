import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }
  try {
    await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1`;
    res.status(200).json({ message: 'Quiz stopped' });
  } catch (error) {
    res.status(500).json({ message: 'Failed', error: String(error) });
  }
}
