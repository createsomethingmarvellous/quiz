import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const { rows } = await sql`SELECT started FROM QuizStatus WHERE id = 1;`;
        const quizStarted = rows.length > 0 && rows[0].started;
        return res.status(200).json({ quizStarted });
    } catch (error) {
        // If the table or row doesn't exist, the quiz hasn't started
        if (error.message.includes('does not exist')) {
            return res.status(200).json({ quizStarted: false });
        }
        console.error('Database Error:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
