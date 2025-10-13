import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const { rows } = await sql`
            SELECT team_name, score FROM Scores ORDER BY score DESC, submitted_at ASC;
        `;
        return res.status(200).json(rows);
    } catch (error) {
        // If the table doesn't exist, it means no scores are present. Return an empty array.
        if (error.message.includes('relation "scores" does not exist')) {
            return res.status(200).json([]);
        }
        // For any other errors, log them and return a server error.
        console.error('Database Error fetching leaderboard:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
