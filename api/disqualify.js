import { sql } from '@vercel/postgres';
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { teamName } = req.body;
    if (!teamName) return res.status(400).json({ error: 'Team name required.' });
    try {
        await sql`CREATE TABLE IF NOT EXISTS Scores (id SERIAL PRIMARY KEY, team_name VARCHAR(255) NOT NULL UNIQUE, score INT NOT NULL, submitted_at TIMESTAMP DEFAULT NOW());`;
        await sql`INSERT INTO Scores (team_name, score) VALUES (${teamName}, -1) ON CONFLICT (team_name) DO UPDATE SET score = -1;`;
        return res.status(200).json({ message: 'User disqualified.' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to disqualify user.' });
    }
}
