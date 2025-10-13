import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    
    const { teamName } = req.body;

    if (!teamName) {
        return res.status(400).json({ message: 'Team name required.' });
    }

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS Scores (
                id SERIAL PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL UNIQUE,
                score INT NOT NULL,
                submitted_at TIMESTAMP DEFAULT NOW(),
                disqualified BOOLEAN DEFAULT FALSE
            );
        `;
        await sql`
            INSERT INTO Scores (team_name, score, disqualified)
            VALUES (${teamName}, 0, TRUE)
            ON CONFLICT (team_name) DO UPDATE
            SET score = 0, disqualified = TRUE;
        `;
        return res.status(200).json({ message: 'User disqualified' });
    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
