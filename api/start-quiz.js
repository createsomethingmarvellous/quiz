import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }
    
    const { duration } = req.body; // Duration in seconds

    if (!duration || typeof duration !== 'number') {
        return res.status(400).json({ message: 'Invalid duration provided.' });
    }

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS QuizStatus (
                id INT PRIMARY KEY,
                started BOOLEAN NOT NULL,
                start_time TIMESTAMPTZ,
                duration_seconds INT
            );
        `;
        await sql`
            INSERT INTO QuizStatus (id, started, start_time, duration_seconds) 
            VALUES (1, TRUE, NOW(), ${duration})
            ON CONFLICT (id) DO UPDATE 
            SET started = TRUE, start_time = NOW(), duration_seconds = ${duration};
        `;
        return res.status(200).json({ message: 'Quiz started' });
    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ message: 'Failed to start quiz' });
    }
}
