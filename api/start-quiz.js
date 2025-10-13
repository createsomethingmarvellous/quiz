import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const { rows } = await sql`SELECT started, duration_seconds FROM QuizStatus WHERE id = 1;`;
        const quizStarted = rows.length > 0 && rows[0].started;
        const duration = rows.length > 0 ? rows[0].duration_seconds : 120;
        return res.status(200).json({ quizStarted, duration });
    } catch (error) {
        if (error.message.includes('does not exist')) {
            return res.status(200).json({ quizStarted: false });
        }
        console.error('Database Error checking quiz status:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
