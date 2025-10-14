import { sql } from '@vercel/postgres';
import questions from '../questions.json' with { type: 'json' };

// Helper to ensure tables exist and have all required columns
const ensureTables = async () => {
    // Create tables if they don't exist
    await sql`CREATE TABLE IF NOT EXISTS Scores (
        id SERIAL PRIMARY KEY,
        team_name VARCHAR(255) NOT NULL UNIQUE,
        score INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT NOW()
    );`;
    
    await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL
    );`;

    // Add missing columns if they don't exist (for migration)
    try {
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS enter_time TIMESTAMP;`;
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP;`;
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS time_taken INT;`;
    } catch (error) {
        // Fallback for older PostgreSQL versions
        const columnsToAdd = [
            'ALTER TABLE Scores ADD COLUMN enter_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN exit_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN time_taken INT'
        ];
        
        for (const columnSQL of columnsToAdd) {
            try {
                await sql.unsafe(columnSQL);
            } catch (colError) {
                // Column already exists - continue
                console.log('Column may already exist:', colError.message);
            }
        }
    }
};

export default async function handler(req, res) {
    const { action } = req.query;

    try {
        await ensureTables(); // Ensure tables exist with all columns

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
            const now = Date.now();
            const fallbackEnter = enterTime || (now - 120000); // 2 min ago if missing
            const fallbackExit = exitTime || now;
            const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);
            
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
                VALUES (${teamName}, ${score}, to_timestamp(${fallbackEnter / 1000}), to_timestamp(${fallbackExit / 1000}), ${timeTaken})
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
            const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;
            
            await sql`
                INSERT INTO Scores (team_name, score, enter_time, exit_time, time_taken)
                VALUES (${teamName}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                ON CONFLICT (team_name) DO UPDATE SET
                    score = -1,
                    exit_time = NOW(),
                    time_taken = ${timeTaken}
            `;
            return res.status(200).json({ message: 'User disqualified.' });
        }

        // --- PUBLIC: Get Leaderboard (Updated Sorting with Time Tie-Breaker) ---
        if (req.method === 'GET' && action === 'leaderboard') {
            try {
                const { rows } = await sql`
                    SELECT team_name, score, enter_time, exit_time, time_taken
                    FROM Scores
                    ORDER BY 
                        -- Push disqualified (score < 0) to the end by treating their score as very low
                        CASE WHEN score < 0 THEN -999 ELSE score END DESC,
                        -- For non-disqualified ties: fastest time first (time_taken ASC, NULLs last)
                        CASE WHEN score < 0 THEN NULL ELSE time_taken END ASC NULLS LAST,
                        -- Final tie-breaker: earlier submission first
                        submitted_at ASC
                `;
                return res.status(200).json(rows);
            } catch (error) {
                console.error('Leaderboard query error:', error);
                return res.status(200).json([]); // Fallback to empty array
            }
        }

        // If no route matches
        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
