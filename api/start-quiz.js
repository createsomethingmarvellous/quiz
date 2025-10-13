import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        await sql`
            CREATE TABLE IF NOT EXISTS QuizStatus (
                id INT PRIMARY KEY,
                started BOOLEAN NOT NULL
            );
        `;
        
        await sql`
            INSERT INTO QuizStatus (id, started) VALUES (1, TRUE)
            ON CONFLICT (id) DO UPDATE SET started = TRUE;
        `;
        
        return res.status(200).send('Quiz started successfully!');
    } catch (error) {
        console.error('Database Error starting quiz:', error);
        return res.status(500).json({ message: 'Failed to start quiz' });
    }
}
