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
    try {
        // Create tables if they don't exist (with UNIQUE constraint)
        await sql`
            CREATE TABLE IF NOT EXISTS Scores (
                id SERIAL PRIMARY KEY,
                team_name VARCHAR(255) NOT NULL,
                round INT NOT NULL DEFAULT 1,
                score INT NOT NULL DEFAULT 0,
                enter_time TIMESTAMP,
                exit_time TIMESTAMP,
                time_taken INT,
                submitted_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(team_name, round)
            );
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS QuizStatus (
                id INT PRIMARY KEY,
                started BOOLEAN NOT NULL DEFAULT FALSE,
                current_round INT NOT NULL DEFAULT 0
            );
        `;

        // Add missing columns safely (raw SQL for ALTER)
        const scoreColumns = [
            'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS round INT DEFAULT 1',
            'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS enter_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS time_taken INT'
        ];

        const statusColumns = [
            'ALTER TABLE QuizStatus ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 0'
        ];

        // Handle Scores columns (individual try-catch)
        for (const columnSQL of scoreColumns) {
            try {
                await sql.unsafe(columnSQL);
                console.log('Migrated Scores column:', columnSQL);
            } catch (colError) {
                console.log('Scores column migration skipped (likely exists):', colError.message);
            }
        }

        // Handle QuizStatus columns
        for (const columnSQL of statusColumns) {
            try {
                await sql.unsafe(columnSQL);
                console.log('Migrated QuizStatus column:', columnSQL);
            } catch (colError) {
                console.log('QuizStatus column migration skipped (likely exists):', colError.message);
            }
        }

        // Ensure UNIQUE constraint on Scores if missing (run once)
        try {
            await sql.unsafe('ALTER TABLE Scores ADD CONSTRAINT IF NOT EXISTS unique_team_round UNIQUE (team_name, round);');
            console.log('Added UNIQUE constraint if missing');
        } catch (constraintError) {
            console.log('UNIQUE constraint skipped (likely exists):', constraintError.message);
        }

        // Ensure QuizStatus row exists and reset to safe defaults
        await sql`
            INSERT INTO QuizStatus (id, started, current_round) 
            VALUES (1, FALSE, 0) 
            ON CONFLICT (id) DO UPDATE SET 
                started = FALSE, 
                current_round = 0
        `;
        console.log('QuizStatus reset to defaults');

    } catch (error) {
        console.error('ensureTables failed:', error.message);
        // Don't throw - continue with partial setup
    }
};

export default async function handler(req, res) {
    const { action, round: roundParam } = req.query;
    const targetRound = parseInt(roundParam) || 1; // For start/leaderboard

    try {
        await ensureTables(); // Run migration (now safe)

        // --- ADMIN: Start Quiz (handles both rounds in one block) ---
        if (req.method === 'POST' && action === 'start') {
            if (targetRound === 1) {
                await sql`DELETE FROM Scores WHERE round = 1;`; // Reset only Round 1
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 1 WHERE id = 1;`;
                console.log('Round 1 started successfully');
                return res.status(200).json({ message: 'Round 1 started and reset.', currentRound: 1 });
            } else if (targetRound === 2) {
                await sql`DELETE FROM Scores WHERE round = 2;`; // Reset only Round 2
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 2 WHERE id = 1;`;
                console.log('Round 2 started successfully');
                return res.status(200).json({ message: 'Round 2 started and reset.', currentRound: 2 });
            } else {
                return res.status(400).json({ message: 'Invalid round (must be 1 or 2).' });
            }
        }

        // --- ADMIN: Stop Quiz ---
        if (req.method === 'POST' && action === 'stop') {
            await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
            console.log('Quiz stopped successfully');
            return res.status(200).json({ message: 'Quiz stopped.', currentRound: targetRound });
        }

        // --- USER: Check Quiz Status ---
        if (req.method === 'GET' && action === 'status') {
            const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
            const status = rows[0] || { started: false, current_round: 0 };
            return res.status(200).json({ 
                quizStarted: status.started, 
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
            if (answers && Array.isArray(answers)) {
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
            return res.status(200).json({ message: 'Score submitted for Round ' + currentRound + '.' });
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
            return res.status(200).json({ message: 'User disqualified for Round ' + currentRound + '.' });
        }

        // --- PUBLIC: Get Leaderboard (filtered by round param, defaults to 1) ---
        if (req.method === 'GET' && action === 'leaderboard') {
            try {
                const { rows } = await sql`
                    SELECT team_name, score, enter_time, exit_time, time_taken
                    FROM Scores
                    WHERE round = ${targetRound}
                    ORDER BY 
                        CASE WHEN score < 0 THEN -999 ELSE score END DESC,
                        CASE WHEN score < 0 THEN NULL ELSE time_taken END ASC NULLS LAST,
                        submitted_at ASC
                `;
                return res.status(200).json(rows);
            } catch (error) {
                console.error('Leaderboard query error for round ' + targetRound + ':', error);
                return res.status(200).json([]);
            }
        }

        // If no route matches
        return res.status(404).json({ message: 'Action not found.' });

    } catch (error) {
        console.error('API Error in ' + action + ' (round ' + targetRound + '):', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
