import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
    try {
        const { rows } = await sql`SELECT started, duration FROM QuizStatus WHERE id = 1;`;
        if (rows.length > 0) {
            return res.status(200).json({ quizStarted: rows[0].started, duration: rows[0].duration });
        }
        return res.status(200).json({ quizStarted: false, duration: 0 });
    } catch (error) {
        return res.status(200).json({ quizStarted: false, duration: 0 });
    }
}
