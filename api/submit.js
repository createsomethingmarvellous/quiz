import { sql } from '@vercel/postgres';
import questions from '../questions.json' with { type: 'json' };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { teamName, answers, cheated } = req.body;

        if (!teamName) {
            return res.status(400).json({ message: 'Missing team name' });
        }

        let score = 0;
        if (cheated) {
            score = -999; // Set a penalty score for disqualification
        } else {
            questions.forEach((q, index) => {
                if (answers[index] === q.answer) {
                    score++;
                }
            });
        }

        await sql`
            CREATE TABLE IF NOT EXISTS Scores (
                id SERIAL PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL UNIQUE,
                score INT NOT NULL,
                submitted_at TIMESTAMP DEFAULT NOW()
            );
        `;
        
        await sql`
            INSERT INTO Scores (team_name, score)
            VALUES (${teamName}, ${score})
            ON CONFLICT (team_name) DO UPDATE SET score = EXCLUDED.score;
        `;
        
        return res.status(200).json({ message: 'Score submitted successfully' });
    } catch (error) {
        console.error('Database Error submitting score:', error);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
