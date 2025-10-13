import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        // Attempt to create the table if it doesn't exist to make the function more robust
        await sql`
            CREATE TABLE IF NOT EXISTS QuizStatus (
                id INT PRIMARY KEY,
                started BOOLEAN NOT NULL
            );
        `;
        
        const { rows } = await sql`SELECT started FROM QuizStatus WHERE id = 1;`;
        const quizStarted = rows.length > 0 && rows[0].started;
        return res.status(200).json({ quizStarted });
    } catch (error) {
        // If any other error occurs, log it and return a generic server error
        console.error('Database Error checking quiz status:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
