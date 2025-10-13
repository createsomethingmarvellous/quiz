import { sql } from '@vercel/postgres';
import questions from '../questions.json' with { type: 'json' };

export default async function handler(req, res) {
    // ... (check for POST method)
    const { teamName, answers } = req.body;

    // ... (validate teamName and answers)
    let score = 0;
    Object.keys(answers).forEach((index) => {
        if (answers[index] === questions[index].answer) {
            score++;
        }
    });

    try {
        await sql`
            CREATE TABLE IF NOT EXISTS Scores (
                id SERIAL PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL UNIQUE,
                score INT NOT NULL,
                submitted_at TIMESTAMP DEFAULT NOW(),
                disqualified BOOLEAN DEFAULT FALSE
            );
        `;
        // Only insert or update if not disqualified
        await sql`
            INSERT INTO Scores (team_name, score)
            VALUES (${teamName}, ${score})
            ON CONFLICT (team_name) DO UPDATE 
            SET score = EXCLUDED.score
            WHERE Scores.disqualified = FALSE;
        `;
        return res.status(200).json({ message: 'Score submitted' });
    } catch (error) {
        // ... (error handling)
    }
}
