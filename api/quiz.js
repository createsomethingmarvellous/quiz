import { sql } from '@vercel/postgres';

// Helper to get questions by round (dynamic fetch – no module import crash)
async function getQuestionsForRound(round) {
    if (round < 1 || round > 2) return [];
    try {
        const response = await fetch(`questions_round${round}.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const questions = await response.json();
        console.log(`JSON loaded for Round ${round}: ${questions.length} questions`);
        return questions;
    } catch (error) {
        console.error(`JSON load failed for Round ${round} (scoring fallback to 0):`, error.message);
        return []; // Safe fallback: score=0
    }
}

// Helper to ensure tables exist and have all required columns (robust, idempotent)
const ensureTables = async () => {
    try {
        console.log('Starting migrations...');

        // Step 1: Create tables with full schema (defaults, unique)
        await sql`CREATE TABLE IF NOT EXISTS Scores (
            id SERIAL PRIMARY KEY,
            round INT NOT NULL DEFAULT 1,
            team_name VARCHAR(255) NOT NULL,
            score INT NOT NULL DEFAULT 0,
            submitted_at TIMESTAMP DEFAULT NOW(),
            enter_time TIMESTAMP,
            exit_time TIMESTAMP,
            time_taken INT DEFAULT 0,
            UNIQUE(round, team_name)
        );`;
        console.log('Scores table ensured.');

        await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
            id INT PRIMARY KEY,
            started BOOLEAN NOT NULL DEFAULT FALSE,
            current_round INT DEFAULT 0
        );`;
        console.log('QuizStatus table ensured.');

        // Step 2: Default QuizStatus row
        await sql`INSERT INTO QuizStatus (id, started, current_round) VALUES (1, FALSE, 0) 
                  ON CONFLICT (id) DO UPDATE SET started = FALSE, current_round = 0;`;
        console.log('QuizStatus default row ensured.');

        // Step 3: Verify/add round column if missing
        try {
            const { rows: roundCol } = await sql`SELECT column_name FROM information_schema.columns 
                                                WHERE table_name = 'Scores' AND column_name = 'round';`;
            if (roundCol.length === 0) {
                console.log('Adding missing round column...');
                await sql`ALTER TABLE Scores ADD COLUMN round INT NOT NULL DEFAULT 1;`;
                await sql`UPDATE Scores SET round = 1 WHERE round IS NULL;`;
                console.log('Round column added and backfilled.');
            } else {
                console.log('Round column already exists.');
            }
        } catch (roundError) {
            console.error('Round column migration failed (non-critical):', roundError.message);
        }

        // Step 4: Add other columns if missing
        const columnsToAdd = [
            { table: 'Scores', column: 'enter_time', type: 'TIMESTAMP' },
            { table: 'Scores', column: 'exit_time', type: 'TIMESTAMP' },
            { table: 'Scores', column: 'time_taken', type: 'INT DEFAULT 0' }
        ];

        for (const { table, column, type } of columnsToAdd) {
            try {
                const alterSQL = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`;
                await sql.unsafe(alterSQL);
                console.log(`${table}.${column} ensured.`);
            } catch (error) {
                console.warn(`Skipped ${table}.${column} (already exists?):`, error.message);
                // Fallback without IF NOT EXISTS
                try {
                    const basicSQL = `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
                    await sql.unsafe(basicSQL);
                } catch (colError) {
                    if (!colError.message.includes('already exists')) {
                        console.error(`Failed to add ${table}.${column}:`, colError.message);
                    }
                }
            }
        }

        // Step 5: Ensure unique constraint
        try {
            await sql`ALTER TABLE Scores ADD CONSTRAINT IF NOT EXISTS unique_round_team UNIQUE (round, team_name);`;
            console.log('Unique constraint ensured.');
        } catch (constraintError) {
            console.warn('Unique constraint already exists:', constraintError.message);
            // Fallback
            try {
                await sql.unsafe('ALTER TABLE Scores ADD CONSTRAINT unique_round_team UNIQUE (round, team_name);');
            } catch (fallbackError) {
                if (!fallbackError.message.includes('already exists') && !fallbackError.message.includes('duplicate')) {
                    console.error('Failed to add unique constraint:', fallbackError.message);
                } else {
                    console.log('Unique constraint already exists.');
                }
            }
        }

        // Step 6: Set safe defaults for time columns and backfill NULL rounds
        try {
            await sql`UPDATE Scores SET 
                      time_taken = COALESCE(time_taken, 0),
                      enter_time = COALESCE(enter_time, submitted_at),
                      exit_time = COALESCE(exit_time, submitted_at);`;
            console.log('Time defaults set.');

            // Backfill NULL rounds
            const { rows: nullCheck } = await sql`SELECT COUNT(*) as null_count FROM Scores WHERE round IS NULL;`;
            let nullCount = 0;
            if (nullCheck && nullCheck.length > 0 && nullCheck[0] && nullCheck[0].null_count !== undefined) {
                nullCount = parseInt(nullCheck[0].null_count, 10);
            }
            if (nullCount > 0) {
                await sql`UPDATE Scores SET round = COALESCE(round, 1) WHERE round IS NULL;`;
                console.log(`Backfilled ${nullCount} NULL rounds to 1.`);
            } else {
                console.log('No NULL rounds to backfill.');
            }
        } catch (defaultError) {
            console.log('Defaults/backfill skipped (no data or already set):', defaultError.message);
        }

        console.log('Migrations complete – DB ready.');
    } catch (error) {
        console.error('Critical migration error (API continues with partial schema):', error);
        // Don't throw – endpoints return safe fallbacks
    }
};

export default async function handler(req, res) {
    const { action, round: queryRound } = req.query;

    try {
        await ensureTables(); // Now crash-proof

        const targetRound = parseInt(queryRound) || 0;

        // --- ADMIN: Start Round 1 (Enhanced error handling)
        if (req.method === 'POST' && action === 'start' && queryRound === '1') {
            try {
                await sql`DELETE FROM Scores WHERE round = 1;`;
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 1 WHERE id = 1;`;
                console.log('Round 1 started successfully.');
                return res.status(200).json({ message: 'Round 1 started and scores reset.', currentRound: 1 });
            } catch (error) {
                console.error('Start Round 1 error:', error.message || error);
                return res.status(500).json({ error: 'Failed to start Round 1', details: error.message || 'DB error' });
            }
        }

        // --- ADMIN: Start Round 2 (Same)
        if (req.method === 'POST' && action === 'start' && queryRound === '2') {
            try {
                await sql`DELETE FROM Scores WHERE round = 2;`;
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 2 WHERE id = 1;`;
                console.log('Round 2 started successfully.');
                return res.status(200).json({ message: 'Round 2 started and scores reset.', currentRound: 2 });
            } catch (error) {
                console.error('Start Round 2 error:', error.message || error);
                return res.status(500).json({ error: 'Failed to start Round 2', details: error.message || 'DB error' });
            }
        }

        // --- ADMIN: Stop Current Round
        if (req.method === 'POST' && action === 'stop') {
            try {
                const { rows: statusRows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                const currentRound = statusRows[0]?.current_round || 0;
                if (currentRound > 0) {
                    await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
                    console.log(`Round ${currentRound} stopped.`);
                    return res.status(200).json({ message: `Round ${currentRound} stopped.`, currentRound });
                }
                return res.status(400).json({ message: 'No active round to stop.' });
            } catch (error) {
                console.error('Stop round error:', error);
                return res.status(500).json({ error: 'Failed to stop round', details: error.message });
            }
        }

        // --- USER: Check Quiz Status (Guarded)
        if (req.method === 'GET' && action === 'status') {
            try {
                const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
                const status = rows.length > 0 ? rows[0] : { started: false, current_round: 0 };
                return res.status(200).json({ quizStarted: status.started, currentRound: status.current_round });
            } catch (error) {
                console.error('Status query error:', error);
                return res.status(200).json({ quizStarted: false, currentRound: 0 }); // Safe fallback
            }
        }

        // --- USER: Submit Score (Dynamic questions + partial array scoring)
        if (req.method === 'POST' && action === 'submit') {
            const { teamName, answers, enterTime, exitTime, round } = req.body;
            try {
                const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                const currentRound = rows[0]?.current_round || 0;
                if (currentRound < 1 || currentRound > 2) {
                    return res.status(400).json({ error: `No active round (current: ${currentRound}) for submission` });
                }
                
                const now = Date.now();
                const fallbackEnter = enterTime || (now - 120000);
                const fallbackExit = exitTime || now;
                const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);
                
                // Dynamic load questions + score (handles array with undefined blanks)
                const questions = await getQuestionsForRound(currentRound);
                let score = 0;
                if (answers && Array.isArray(answers) && questions.length > 0) {
                    answers.forEach((ans, index) => {
                        if (ans !== undefined && ans === questions[index]?.answer) {
                            score++;
                        }
                        // Blanks (undefined) or wrong: +0
                    });
                    console.log(`Partial scoring: ${score}/${questions.length} correct for Team ${teamName}`);
                } else {
                    console.warn(`Scoring warning: Invalid/old answers for Round ${currentRound} (type: ${typeof answers}) – Score 0`);
                    score = 0;
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
                console.log(`Insert success: Team ${teamName}, Round ${currentRound}, Score ${score}`);
                return res.status(200).json({ message: `Score ${score} submitted for Round ${currentRound}. Questions loaded: ${questions.length}` });
            } catch (insertError) {
                console.error('Insert error:', insertError);
                return res.status(500).json({ error: 'Failed to save score', details: insertError.message });
            }
        }
        
        // --- USER: Disqualify (Fixed: Full UPDATE)
        if (req.method === 'POST' && action === 'disqualify') {
            const { teamName, enterTime, round } = req.body;
            try {
                const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                const currentRound = rows[0]?.current_round || 0;
                if (currentRound < 1 || currentRound > 2) {
                    return res.status(400).json({ error: `No active round (current: ${currentRound}) for disqualification` });
                }
                
                const exitTime = Date.now();
                const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;
                
                await sql`
                    INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                    VALUES (${currentRound}, ${teamName}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                    ON CONFLICT (round, team_name) DO UPDATE SET
                        score = -1,
                        enter_time = EXCLUDED.enter_time,
                        exit_time = NOW(),
                        time_taken = ${timeTaken}
                `;
                console.log(`Disqualify success: Team ${teamName}, Round ${currentRound}`);
                return res.status(200).json({ message: `Disqualified for Round ${currentRound}` });
            } catch (error) {
                console.error('Disqualify error:', error);
                return res.status(500).json({ error: 'Failed to disqualify', details: error.message });
            }
        }

        // --- PUBLIC/ADMIN: Get Leaderboard (Guarded)
        if (req.method === 'GET' && action === 'leaderboard') {
            let queryRound;
            if (targetRound === 0) {
                const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                queryRound = rows[0]?.current_round || 0;
            } else {
                queryRound = targetRound;
            }
            if (queryRound < 1 || queryRound > 2) {
                console.log(`No round for leaderboard: ${queryRound}`);
                return res.status(200).json({ data: [], round: queryRound, message: 'No active round' });
            }
            
            try {
                const { rows } = await sql`
                    SELECT 
                        team_name, 
                        score, 
                        COALESCE(enter_time, submitted_at) as enter_time,
                        COALESCE(exit_time, submitted_at) as exit_time,
                        COALESCE(time_taken, 0) as time_taken,
                        submitted_at
                    FROM Scores
                    WHERE round = ${queryRound}
                    ORDER BY 
                        CASE WHEN score < 0 THEN -999 ELSE score END DESC,
                        CASE WHEN score < 0 THEN 999999 ELSE COALESCE(time_taken, 999999) END ASC,
                        COALESCE(submitted_at, '1970-01-01'::timestamp) ASC
                `;
                console.log(`Leaderboard fetched for Round ${queryRound}: ${rows.length} rows`);
                return res.status(200).json({ data: rows, round: queryRound });
            } catch (error) {
                console.error('Leaderboard query error:', error);
                return res.status(200).json({ data: [], round: queryRound, error: 'Query failed', details: error.message });
            }
        }

        // If no route matches
        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
