import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    try {
        // Reset quiz status
        await sql`
            UPDATE QuizStatus SET started = FALSE WHERE id = 1;
        `;
        // Clear all scores
        await sql`
            TRUNCATE TABLE Scores;
        `;
        return res.status(200).json({ message: 'Quiz and leaderboard have been reset.' });
    } catch (error) {
        // If tables don't exist, we can ignore the error
        if (error.message.includes('does not exist')) {
            return res.status(200).json({ message: 'Tables not found, state is clean.' });
        }
        return res.status(500).json({ error: 'Failed to reset quiz.' });
    }
}
