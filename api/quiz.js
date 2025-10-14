import { sql } from '@vercel/postgres';

// Import questions for both rounds
import questionsRound1 from '../questions-round1.json' with { type: 'json' };
import questionsRound2 from '../questions-round2.json' with { type: 'json' };

// Helper to get questions by round
function getQuestionsByRound(round) {
    return round === 1 ? questionsRound1 : questionsRound2;
}

// Helper to ensure tables exist and have all required columns
const ensureTables = async () => {
    // Create tables if they don't exist
    await sql`CREATE TABLE IF NOT EXISTS Scores (
        id SERIAL PRIMARY KEY,
        team_name VARCHAR(255) NOT NULL UNIQUE,
        round INT NOT NULL DEFAULT 1,
        score INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT NOW()
    );`;
    
    await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL DEFAULT FALSE,
        current_round INT NOT NULL DEFAULT 0
    );`;

    // Add missing columns if they don't exist (migration)
    try {
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS round INT DEFAULT 1;`;
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS enter_time TIMESTAMP;`;
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP;`;
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS time_taken INT;`;
        await sql`ALTER TABLE QuizStatus ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 0;`;
    } catch (error) {
        // Fallback for older PostgreSQL
        const columnsToAdd = [
            'ALTER TABLE Scores ADD COLUMN round INT DEFAULT 1',
            'ALTER TABLE Scores ADD COLUMN enter_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN exit_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN time_taken INT',
            'ALTER TABLE QuizStatus ADD COLUMN current_round INT DEFAULT 0'
        ];
        
        for (const columnSQL of columnsToAdd) {
            try {
                await sql.unsafe(columnSQL);
            } catch (colError) {
                console.log('Column may already exist:', colError.message);
            }
        }
    }

    // Ensure QuizStatus has a default row
    await sql`INSERT INTO QuizStatus (id, started, current_round) VALUES (1, FALSE, 0) ON CONFLICT (id) DO UPDATE SET started = FALSE, current_round = 0;`;
};

export default async function handler(req, res) {
    const { action, round } = req.query; // round param for leaderboard filtering
    const selectedRound = parseInt(round) || 1; // Default to round 1 if not specified

    try {
        await ensureTables();

        // --- ADMIN: Start Round 1 ---
        if (req.method === 'POST' && action === 'start' && selectedRound === 1) {
            await sql`DELETE FROM Scores WHERE round = 1;`; // Reset only Round 1
            await sql`UPDATE QuizStatus SET started = TRUE, current_round = 1 WHERE id = 1;`;
            return res.status(200).json({ message: 'Round 1 started and reset.' });
        }

        // --- ADMIN: Start Round 2 ---
        if (req.method === 'POST' && action === 'start' && selectedRound === 2) {
            await sql`DELETE FROM Scores WHERE round = 2;`; // Reset only Round 2
            await sql`UPDATE QuizStatus SET started = TRUE, current_round = 2 WHERE id = 1;`;
            return res.status(200).json({ message: 'Round 2 started and reset.' });
        }

        // --- ADMIN: Stop Quiz (applies to current round) ---
        if (req.method === 'POST' && action === 'stop') {
            await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
            return res.status(200).json({ message: 'Quiz stopped.' });
        }

        // --- USER: Check Quiz Status ---
        if (req.method === 'GET' && action === 'status') {
            const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
            const status = rows[0] || { started: false, current_round: 0 };
            return res.status(200).json({ 
                quizStarted: status.started && status.current_round > 0, 
                currentRound: status.current_round 
            });
        }

        // --- USER: Get Questions for Current Round ---
        if (req.method === 'GET' && action === 'questions') {
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 1;
            const questions = getQuestionsByRound(currentRound);
            return res.status(200).json(questions);
        }

        // --- USER: Submit Score (for current round) ---
        if (req.method === 'POST' && action === 'submit') {
            const { rows: statusRows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = statusRows[0]?.current_round || 1;
            const { teamName, answers, enterTime, exitTime } = req.body;
            const now = Date.now();
            const fallbackEnter = enterTime || (now - 120000);
            const fallbackExit = exitTime || now;
            const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);
            
            let score = 0;
            const questions = getQuestionsByRound(currentRound);
            if (answers) {
                questions.forEach((q, index) => {
                    if (answers[index] === q.answer) {
                        score++;
                    }
                });
            }
            
            await sql`
                INSERT INTO Scores (team_name, round, score, enter_time, exit_time, time_taken)
                VALUES (${teamName}, ${currentRound}, ${score}, to_timestamp(${fallbackEnter / 1000}), to_timestamp(${fallbackExit / 1000}), ${timeTaken})
                ON CONFLICT (team_name, round) DO UPDATE SET
                    score = EXCLUDED.score,
                    enter_time = EXCLUDED.enter_time,
                    exit_time = EXCLUDED.exit_time,
                    time_taken = EXCLUDED.time_taken
            `;
            return res.status(200).json({ message: 'Score submitted.' });
        }
        
        // --- USER: Disqualify (for current round) ---
        if (req.method === 'POST' && action === 'disqualify') {
            const { rows: statusRows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = statusRows[0]?.current_round || 1;
            const { teamName, enterTime } = req.body;
            const exitTime = Date.now();
            const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;
            
            await sql`
                INSERT INTO Scores (team_name, round, score, enter_time, exit_time, time_taken)
                VALUES (${teamName}, ${currentRound}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                ON CONFLICT (team_name, round) DO UPDATE SET
                    score = -1,
                    exit_time = NOW(),
                    time_taken = ${timeTaken}
            `;
            return res.status(200).json({ message: 'User disqualified.' });
        }

        // --- PUBLIC: Get Leaderboard (filtered by round param) ---
        if (req.method === 'GET' && action === 'leaderboard') {
            try {
                const { rows } = await sql`
                    SELECT team_name, score, enter_time, exit_time, time_taken
                    FROM Scores
                    WHERE round = ${selectedRound}
                    ORDER BY 
                        CASE WHEN score < 0 THEN -999 ELSE score END DESC,
                        CASE WHEN score < 0 THEN NULL ELSE time_taken END ASC NULLS LAST,
                        submitted_at ASC
                `;
                return res.status(200).json(rows);
            } catch (error) {
                console.error('Leaderboard query error:', error);
                return res.status(200).json([]);
            }
        }

        // If no route matches
        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
