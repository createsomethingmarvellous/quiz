import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { duration } = req.body; // Duration in seconds

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS QuizStatus (
                id INT PRIMARY KEY,
                started BOOLEAN NOT NULL,
                duration INT
            );
        `;
        await sql`
            INSERT INTO QuizStatus (id, started, duration) VALUES (1, TRUE, ${duration})
            ON CONFLICT (id) DO UPDATE SET started = TRUE, duration = ${duration};
        `;
        return res.status(200).json({ message: 'Quiz started' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to start quiz' });
    }
}
