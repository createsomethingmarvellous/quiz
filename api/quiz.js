import { sql } from '@vercel/postgres';
import questions from '../questions.json' with { type: 'json' };

// Helper to create tables if they don't exist
const ensureTables = async () => {
    await sql`CREATE TABLE IF NOT EXISTS Scores (
        id SERIAL PRIMARY KEY,
        team_name VARCHAR(255) NOT NULL UNIQUE,
        score INT NOT NULL DEFAULT 0,
        enter_time TIMESTAMP,
        exit_time TIMESTAMP,
        time_taken INT,  -- In seconds
        submitted_at TIMESTAMP DEFAULT NOW()
    );`;
    await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL
    );`;
};

export default async function handler(req, res) {
    const { action } = req.query;

    try {
        await ensureTables(); // Ensure tables exist on every request

        // --- ADMIN: Start Quiz & Reset ---
        if (req.method === 'POST' && action === 'start') {
            await sql`TRUNCATE TABLE Scores;`; // Clear scores and times
            await sql`DELETE FROM QuizStatus WHERE id = 1;`; // Reset status
            await sql`INSERT INTO QuizStatus (id, started) VALUES (1, TRUE);`;
            return res.status(200).json({ message: 'Quiz started and scores reset.' });
        }

        // --- USER: Check Quiz Status ---
        if (req.method === 'GET' && action === 'status') {
            const { rows } = await sql`SELECT started FROM QuizStatus WHERE id = 1;`;
            return res.status(200).json({ quizStarted: rows.length > 0 && rows[0].started });
        }

        // --- USER: Submit Score ---
        if (req.method === 'POST' && action === 'submit') {
            const { teamName, answers, enterTime, exitTime } = req.body;
            const timeTaken = Math.floor((exitTime - enterTime) / 1000); // Calculate in seconds
            let score = 0;
            if (answers) {
                questions.forEach((q, index) => {
                    if (answers[index] === q.answer) {
                        score++;
                    }
                });
            }
            await sql`
                INSERT INTO Scores (team_name, score, enter_time, exit_time, time_taken)
                VALUES (${teamName}, ${score}, to_timestamp(${enterTime / 1000}), to_timestamp(${exitTime / 1000}), ${timeTaken})
                ON CONFLICT (team_name) DO UPDATE SET
                    score = EXCLUDED.score,
                    enter_time = EXCLUDED.enter_time,
                    exit_time = EXCLUDED.exit_time,
                    time_taken = EXCLUDED.time_taken
            `;
            return res.status(200).json({ message: 'Score submitted.' });
        }
        
        // --- USER: Disqualify ---
        if (req.method === 'POST' && action === 'disqualify') {
            const { teamName, enterTime } = req.body;
            const exitTime = Date.now();
            const timeTaken = Math.floor((exitTime - enterTime) / 1000); // Still calculate time until disqualification
            await sql`
                INSERT INTO Scores (team_name, score, enter_time, exit_time, time_taken)
                VALUES (${teamName}, -1, to_timestamp(${enterTime / 1000}), NOW(), ${timeTaken})
                ON CONFLICT (team_name) DO UPDATE SET
                    score = -1,
                    exit_time = NOW(),
                    time_taken = ${timeTaken}
            `;
            return res.status(200).json({ message: 'User disqualified.' });
        }

        // --- PUBLIC: Get Leaderboard ---
        if (req.method === 'GET' && action === 'leaderboard') {
            const { rows } = await sql`
                SELECT team_name, score, enter_time, exit_time, time_taken
                FROM Scores
                ORDER BY 
                    CASE WHEN score < 0 THEN 999 END,  -- Disqualified last
                    score DESC, 
                    submitted_at ASC
            `;
            return res.status(200).json(rows);
        }

        // If no route matches
        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
