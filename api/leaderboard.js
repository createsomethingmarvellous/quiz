import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const { rows } = await sql`
            SELECT team_name, score, disqualified FROM Scores 
            ORDER BY disqualified ASC, score DESC, submitted_at ASC;
        `;
        return res.status(200).json(rows);
    } catch (error) {
        if (error.message.includes('does not exist')) {
            return res.status(200).json([]);
        }
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
