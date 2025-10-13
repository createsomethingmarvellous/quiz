import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const { rows } = await sql`SELECT started, start_time, duration_seconds FROM QuizStatus WHERE id = 1;`;
        if (rows.length > 0) {
            return res.status(200).json({ 
                quizStarted: rows[0].started, 
                startTime: rows[0].start_time, 
                duration: rows[0].duration_seconds 
            });
        }
        return res.status(200).json({ quizStarted: false });
    } catch (error) {
        if (error.message.includes('does not exist')) {
            return res.status(200).json({ quizStarted: false });
        }
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
