import { sql } from '@vercel/postgres';

// Helper to ensure tables exist and have all required columns with proper constraints
const ensureTables = async () => {
    // Create tables if they don't exist (initial structure without unique for migration)
    await sql`CREATE TABLE IF NOT EXISTS Scores (
        id SERIAL PRIMARY KEY,
        team_name VARCHAR(255) NOT NULL,
        score INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT NOW()
    );`;
    
    await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL DEFAULT FALSE,
        current_round INT DEFAULT 0
    );`;

    // Migration: Add columns if missing
    const migrations = [
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS round INT DEFAULT 1',
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS enter_time TIMESTAMP',
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP',
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS time_taken INT',
        'ALTER TABLE QuizStatus ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 0'
    ];
    
    for (const migration of migrations) {
        try {
            await sql.unsafe(migration);
            console.log(`Migration successful: ${migration}`);
        } catch (error) {
            console.log(`Migration skipped (likely exists): ${migration} - ${error.message}`);
        }
    }

    // Migrate existing data: Set round = 1 for old rows (if no round column was added, this will fail gracefully)
    try {
        await sql`UPDATE Scores SET round = 1 WHERE round IS NULL OR round = 0;`;
        console.log('Updated existing scores to Round 1');
    } catch (error) {
        console.log('No existing data to migrate or round column issue: ' + error.message);
    }

    // Handle unique constraint migration
    // First, drop old unique on team_name if exists (to avoid conflicts)
    try {
        await sql`ALTER TABLE Scores DROP CONSTRAINT IF EXISTS scores_team_name_key;`;
        console.log('Dropped old unique constraint on team_name');
    } catch (error) {
        console.log('No old constraint to drop: ' + error.message);
    }

    // Add composite unique constraint on (round, team_name) if not exists
    try {
        await sql`ALTER TABLE Scores ADD CONSTRAINT scores_round_team_name_key UNIQUE (round, team_name);`;
        console.log('Added composite unique constraint on (round, team_name)');
    } catch (error) {
        console.log('Constraint may already exist: ' + error.message);
    }

    // Ensure QuizStatus has a default row
    await sql`INSERT INTO QuizStatus (id, started, current_round) VALUES (1, FALSE, 0) ON CONFLICT (id) DO UPDATE SET started = FALSE, current_round = 0;`;
};

// Load questions based on round (fetch static file)
async function getQuestionsForRound(round) {
    try {
        const response = await fetch(`questions_round${round}.json`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Failed to fetch questions_round${round}.json`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading questions for round ' + round + ':', error);
        return []; // Fallback empty array
    }
}

export default async function handler(req, res) {
    const { action, round } = req.query;

    try {
        await ensureTables(); // Run migration on every request (safe, idempotent)

        // --- ADMIN: Start Round 1 ---
        if (req.method === 'POST' && action === 'start' && round === '1') {
            try {
                await sql`DELETE FROM Scores WHERE round = 1;`; // Clear only Round 1 scores
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 1 WHERE id = 1;`;
                console.log('Round 1 started successfully');
                return res.status(200).json({ message: 'Round 1 started and scores reset.' });
            } catch (error) {
                console.error('Error starting Round 1:', error);
                return res.status(500).json({ message: 'Failed to start Round 1', error: error.message });
            }
        }

        // --- ADMIN: Start Round 2 ---
        if (req.method === 'POST' && action === 'start' && round === '2') {
            try {
                await sql`DELETE FROM Scores WHERE round = 2;`; // Clear only Round 2 scores
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 2 WHERE id = 1;`;
                console.log('Round 2 started successfully');
                return res.status(200).json({ message: 'Round 2 started and scores reset.' });
            } catch (error) {
                console.error('Error starting Round 2:', error);
                return res.status(500).json({ message: 'Failed to start Round 2', error: error.message });
            }
        }

        // --- ADMIN: Stop Current Round ---
        if (req.method === 'POST' && action === 'stop') {
            try {
                const { rows: statusRows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                const currentRound = statusRows[0]?.current_round || 0;
                if (currentRound > 0) {
                    await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
                    console.log(`Round ${currentRound} stopped`);
                    return res.status(200).json({ message: `Current round (${currentRound}) stopped.` });
                }
                return res.status(400).json({ message: 'No active round to stop.' });
            } catch (error) {
                console.error('Error stopping round:', error);
                return res.status(500).json({ message: 'Failed to stop round', error: error.message });
            }
        }

        // --- USER: Check Quiz Status (includes current_round) ---
        if (req.method === 'GET' && action === 'status') {
            const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
            const status = rows.length > 0 ? rows[0] : { started: false, current_round: 0 };
            return res.status(200).json({ quizStarted: status.started, currentRound: status.current_round });
        }

        // --- USER: Submit Score (includes current_round and scoring) ---
        if (req.method === 'POST' && action === 'submit') {
            const { teamName, answers, enterTime, exitTime, round: clientRound } = req.body;
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 0;
            if (currentRound < 1 || currentRound > 2) {
                return res.status(400).json({ error: 'No active round for submission' });
            }
            const useRound = clientRound || currentRound; // Fallback to server round if client missing
            
            const now = Date.now();
            const fallbackEnter = enterTime || (now - 120000);
            const fallbackExit = exitTime || now;
            const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);
            
            const questions = await getQuestionsForRound(useRound);
            let score = 0;
            if (answers && questions.length > 0) {
                questions.forEach((q, index) => {
                    if (answers[index] && parseInt(answers[index]) === q.answer) {
                        score++;
                    }
                });
            }
            
            await sql`
                INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                VALUES (${useRound}, ${teamName}, ${score}, to_timestamp(${fallbackEnter / 1000}), to_timestamp(${fallbackExit / 1000}), ${timeTaken})
                ON CONFLICT (round, team_name) DO UPDATE SET
                    score = EXCLUDED.score,
                    enter_time = EXCLUDED.enter_time,
                    exit_time = EXCLUDED.exit_time,
                    time_taken = EXCLUDED.time_taken
            `;
            console.log(`Score submitted for Round ${useRound}: Team ${teamName} - ${score}`);
            return res.status(200).json({ message: 'Score submitted for Round ' + useRound });
        }
        
        // --- USER: Disqualify (includes current_round) ---
        if (req.method === 'POST' && action === 'disqualify') {
            const { teamName, enterTime, round: clientRound } = req.body;
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 0;
            if (currentRound < 1 || currentRound > 2) {
                return res.status(400).json({ error: 'No active round for disqualification' });
            }
            const useRound = clientRound || currentRound;
            
            const exitTime = Date.now();
            const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;
            
            await sql`
                INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                VALUES (${useRound}, ${teamName}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                ON CONFLICT (round, team_name) DO UPDATE SET
                    score = -1,
                    exit_time = NOW(),
                    time_taken = ${timeTaken}
            `;
            console.log(`User disqualified for Round ${useRound}: Team ${teamName}`);
            return res.status(200).json({ message: 'User disqualified for Round ' + useRound });
        }

        // --- PUBLIC/ADMIN: Get Leaderboard (filtered by round) ---
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
                console.log('No valid round for leaderboard query');
                return res.status(200).json([]); // Empty array for no round
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
                console.log(`Leaderboard fetched for Round ${queryRound}: ${rows.length} entries`);
                return res.status(200).json(rows);
            } catch (error) {
                console.error('Leaderboard query error for Round ' + queryRound + ':', error);
                return res.status(500).json({ message: 'Leaderboard query failed', error: error.message });
            }
        }

        // If no route matches
        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('Overall API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
