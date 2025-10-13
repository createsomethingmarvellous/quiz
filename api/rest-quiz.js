import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        // Reset quiz status
        await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;

        // Clear all scores
        await sql`DROP TABLE IF EXISTS Scores;`;
        await sql`
            CREATE TABLE Scores (
                id SERIAL PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL UNIQUE,
                score INT NOT NULL,
                submitted_at TIMESTAMP DEFAULT NOW()
            );
        `;

        return res.status(200).json({ message: 'Quiz has been reset.' });
    } catch (error) {
        console.error('Database Error resetting quiz:', error);
        return res.status(500).json({ message: 'Failed to reset quiz' });
    }
}
