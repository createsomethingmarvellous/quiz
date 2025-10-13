import { sql } from '@vercel/postgres';
import questions from '../questions.json' with { type: 'json' };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { teamName, answers, hasCheated } = req.body;

        if (!teamName) {
            return res.status(400).json({ message: 'Missing team name' });
        }

        let score = 0;
        if (hasCheated) {
            score = -1; // Disqualified score
        } else {
            questions.forEach((q, index) => {
                if (answers && answers[index] !== undefined && parseInt(answers[index], 10) === q.answer) {
                    score++;
                }
            });
        }

        await sql`
            INSERT INTO Scores (team_name, score)
            VALUES (${teamName}, ${score})
            ON CONFLICT (team_name) DO UPDATE SET score = EXCLUDED.score, submitted_at = NOW();
        `;
        
        return res.status(200).json({ message: 'Score submitted' });
    } catch (error) {
        console.error('Database Error submitting score:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
