import { sql } from '@vercel/postgres';

// Helper to ensure tables exist and have all required columns
const ensureTables = async () => {
    // Create tables if they don't exist
    await sql`CREATE TABLE IF NOT EXISTS Scores (
        id SERIAL PRIMARY KEY,
        round INT NOT NULL,
        team_name VARCHAR(255) NOT NULL UNIQUE,
        score INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT NOW()
    );`;
    
    await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL DEFAULT FALSE,
        current_round INT DEFAULT 0
    );`;

    // Add missing columns if they don't exist (for migration)
    try {
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS enter_time TIMESTAMP;`;
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP;`;
        await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS time_taken INT;`;
        await sql`ALTER TABLE QuizStatus ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 0;`;
    } catch (error) {
        // Fallback for older PostgreSQL versions
        const columnsToAdd = [
            'ALTER TABLE Scores ADD COLUMN enter_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN exit_time TIMESTAMP',
            'ALTER TABLE Scores ADD COLUMN time_taken INT',
            'ALTER TABLE QuizStatus ADD COLUMN current_round INT DEFAULT 0'
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

    // Ensure QuizStatus has a default row
    await sql`INSERT INTO QuizStatus (id, started, current_round) VALUES (1, FALSE, 0) ON CONFLICT (id) DO NOTHING;`;
};

// Load questions based on round (server-side for security, but since static, we could do client-side too)
async function getQuestionsForRound(round) {
    try {
        const response = await fetch(`questions_round${round}.json`);
        return await response.json();
    } catch (error) {
        console.error('Error loading questions:', error);
        return []; // Fallback empty
    }
}

export default async function handler(req, res) {
    const { action, round } = req.query; // round param for leaderboard

    try {
        await ensureTables(); // Ensure tables exist with all columns

        // --- ADMIN: Start Round 1 ---
        if (req.method === 'POST' && action === 'start' && round === '1') {
            await sql`DELETE FROM Scores WHERE round = 1;`; // Clear only Round 1 scores
            await sql`UPDATE QuizStatus SET started = TRUE, current_round = 1 WHERE id = 1;`;
            return res.status(200).json({ message: 'Round 1 started and scores reset.' });
        }

        // --- ADMIN: Start Round 2 ---
        if (req.method === 'POST' && action === 'start' && round === '2') {
            await sql`DELETE FROM Scores WHERE round = 2;`; // Clear only Round 2 scores
            await sql`UPDATE QuizStatus SET started = TRUE, current_round = 2 WHERE id = 1;`;
            return res.status(200).json({ message: 'Round 2 started and scores reset.' });
        }

        // --- ADMIN: Stop Current Round ---
        if (req.method === 'POST' && action === 'stop') {
            const { rows: statusRows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = statusRows[0]?.current_round || 0;
            if (currentRound > 0) {
                await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
                return res.status(200).json({ message: `Current round (${currentRound}) stopped.` });
            }
            return res.status(400).json({ message: 'No active round to stop.' });
        }

        // --- USER: Check Quiz Status (includes current_round) ---
        if (req.method === 'GET' && action === 'status') {
            const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
            const status = rows.length > 0 ? rows[0] : { started: false, current_round: 0 };
            return res.status(200).json({ quizStarted: status.started, currentRound: status.current_round });
        }

        // --- USER: Get Questions for Current Round ---
        if (req.method === 'GET' && action === 'questions') {
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 0;
            if (currentRound < 1 || currentRound > 2) {
                return res.status(400).json({ error: 'No active round' });
            }
            const questions = await getQuestionsForRound(currentRound);
            return res.status(200).json(questions);
        }

        // --- USER: Submit Score (includes current_round) ---
        if (req.method === 'POST' && action === 'submit') {
            const { teamName, answers, enterTime, exitTime } = req.body;
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 0;
            if (currentRound < 1 || currentRound > 2) {
                return res.status(400).json({ error: 'No active round for submission' });
            }
            
            const now = Date.now();
            const fallbackEnter = enterTime || (now - 120000);
            const fallbackExit = exitTime || now;
            const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);
            
            let score = 0;
            if (answers) {
                const questions = await getQuestionsForRound(currentRound);
                questions.forEach((q, index) => {
                    if (answers[index] === q.answer) {
                        score++;
                    }
                });
            }
            
            await sql`
                INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                VALUES (${currentRound}, ${teamName}, ${score}, to_timestamp(${fallbackEnter / 1000}), to_timestamp(${fallbackExit / 1000}), ${timeTaken})
                ON CONFLICT (round, team_name) DO UPDATE SET
                    score = EXCLUDED.score,
                    enter_time = EXCLUDED.enter_time,
                    exit_time = EXCLUDED.exit_time,
                    time_taken = EXCLUDED.time_taken
            `;
            return res.status(200).json({ message: 'Score submitted for Round ' + currentRound });
        }
        
        // --- USER: Disqualify (includes current_round) ---
        if (req.method === 'POST' && action === 'disqualify') {
            const { teamName, enterTime } = req.body;
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 0;
            if (currentRound < 1 || currentRound > 2) {
                return res.status(400).json({ error: 'No active round for disqualification' });
            }
            
            const exitTime = Date.now();
            const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;
            
            await sql`
                INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                VALUES (${currentRound}, ${teamName}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                ON CONFLICT (round, team_name) DO UPDATE SET
                    score = -1,
                    exit_time = NOW(),
                    time_taken = ${timeTaken}
            `;
            return res.status(200).json({ message: 'User disqualified for Round ' + currentRound });
        }

        // --- PUBLIC: Get Leaderboard (filtered by round) ---
        if (req.method === 'GET' && action === 'leaderboard') {
            const targetRound = parseInt(round) || 0; // 0 means current round
            let queryRound;
            if (targetRound === 0) {
                const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                queryRound = rows[0]?.current_round || 0;
            } else {
                queryRound = targetRound;
            }
            if (queryRound < 1 || queryRound > 2) {
                return res.status(200).json([]); // No round active
            }
            
            try {
                const { rows } = await sql`
                    SELECT team_name, score, enter_time, exit_time, time_taken
                    FROM Scores
                    WHERE round = ${queryRound}
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
