import { sql } from '@vercel/postgres';
import fs from 'fs/promises'; // For potential JSON read if fetch fails

let migrationsRun = false; // Cache: Run ensureTables only once

// Helper to get questions by round (dynamic fetch from public/ – fallback empty)
async function getQuestionsForRound(round) {
    if (round < 1 || round > 2) return [];
    try {
        const response = await fetch(`/questions_round${round}.json`); // /public/ assumed
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const questions = await response.json();
        console.log(`JSON loaded for Round ${round}: ${questions.length} questions`);
        return questions;
    } catch (error) {
        console.error(`JSON load failed for Round ${round} (scoring fallback to 0):`, error.message);
        return []; // Safe: score=0
    }
}

// Helper to ensure tables (robust, run once)
const ensureTables = async () => {
    if (migrationsRun) {
        console.log('Migrations already run – skipping.');
        return;
    }
    try {
        console.log('Starting migrations...');

        // Step 1: Create tables with full schema
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

        // Step 3: Verify/add round column
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

        // Step 4: Add other columns
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

        // Step 5: Unique constraint
        try {
            await sql`ALTER TABLE Scores ADD CONSTRAINT IF NOT EXISTS unique_round_team UNIQUE (round, team_name);`;
            console.log('Unique constraint ensured.');
        } catch (constraintError) {
            console.warn('Unique constraint already exists:', constraintError.message);
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

        // Step 6: Defaults and backfill
        try {
            await sql`UPDATE Scores SET 
                      time_taken = COALESCE(time_taken, 0),
                      enter_time = COALESCE(enter_time, submitted_at),
                      exit_time = COALESCE(exit_time, submitted_at);`;
            console.log('Time defaults set.');

            const { rows: nullCheck } = await sql`SELECT COUNT(*) as null_count FROM Scores WHERE round IS NULL;`;
            const nullCount = nullCheck?.[0]?.null_count || 0; // Safer access
            if (nullCount > 0) {
                await sql`UPDATE Scores SET round = COALESCE(round, 1) WHERE round IS NULL;`;
                console.log(`Backfilled ${nullCount} NULL rounds to 1.`);
            } else {
                console.log('No NULL rounds to backfill.');
            }
        } catch (defaultError) {
            console.log('Defaults/backfill skipped (no data or already set):', defaultError.message);
        }

        migrationsRun = true; // Mark done
        console.log('Migrations complete – DB ready.');
    } catch (error) {
        console.error('Critical migration error (API continues with partial schema):', error);
    }
};

export default async function handler(req, res) {
    // CORS for client safety
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const { action, round: queryRound } = req.query;

    try {
        await ensureTables();

        const targetRound = parseInt(queryRound) || 0;

        // --- ADMIN: Start Round 1 (Transaction + Verify)
        if (req.method === 'POST' && action === 'start' && queryRound === '1') {
            const client = await sql.connect();
            try {
                await client.sql`BEGIN;`;
                await client.sql`DELETE FROM Scores WHERE round = 1;`;
                await client.sql`UPDATE QuizStatus SET started = TRUE, current_round = 1 WHERE id = 1;`;
                await client.sql`COMMIT;`;
                console.log('Round 1 started successfully with transaction.');
                // Verify
                const { rows: verify } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
                console.log('Verified QuizStatus after start:', verify[0] || 'No row');
                return res.status(200).json({ message: 'Round 1 started and scores reset.', currentRound: 1 });
            } catch (error) {
                await client.sql`ROLLBACK;`;
                console.error('Start Round 1 transaction error:', error.message || error);
                return res.status(500).json({ error: 'Failed to start Round 1', details: error.message || 'DB error' });
            } finally {
                client.release();
            }
        }

        // --- ADMIN: Start Round 2 (Same)
        if (req.method === 'POST' && action === 'start' && queryRound === '2') {
            const client = await sql.connect();
            try {
                await client.sql`BEGIN;`;
                await client.sql`DELETE FROM Scores WHERE round = 2;`;
                await client.sql`UPDATE QuizStatus SET started = TRUE, current_round = 2 WHERE id = 1;`;
                await client.sql`COMMIT;`;
                console.log('Round 2 started successfully with transaction.');
                const { rows: verify } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
                console.log('Verified QuizStatus after start:', verify[0] || 'No row');
                return res.status(200).json({ message: 'Round 2 started and scores reset.', currentRound: 2 });
            } catch (error) {
                await client.sql`ROLLBACK;`;
                console.error('Start Round 2 transaction error:', error.message || error);
                return res.status(500).json({ error: 'Failed to start Round 2', details: error.message || 'DB error' });
            } finally {
                client.release();
            }
        }

        // --- ADMIN: Stop Current Round (Transaction + Verify)
        if (req.method === 'POST' && action === 'stop') {
            const client = await sql.connect();
            try {
                const { rows: statusRows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                const currentRound = statusRows[0]?.current_round || 0;
                if (currentRound > 0) {
                    await client.sql`BEGIN;`;
                    await client.sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
                    await client.sql`COMMIT;`;
                    console.log(`Round ${currentRound} stopped with transaction.`);
                    const { rows: verify } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
                    console.log('Verified QuizStatus after stop:', verify[0] || 'No row');
                    return res.status(200).json({ message: `Round ${currentRound} stopped.`, currentRound });
                }
                return res.status(400).json({ message: 'No active round to stop.' });
            } catch (error) {
                await client.sql`ROLLBACK;`;
                console.error('Stop round transaction error:', error.message || error);
                return res.status(500).json({ error: 'Failed to stop round', details: error.message });
            } finally {
                client.release();
            }
        }

        // --- USER: Check Quiz Status (Log DB row)
        if (req.method === 'GET' && action === 'status') {
            try {
                const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
                const status = rows.length > 0 ? rows[0] : { started: false, current_round: 0 };
                console.log('Status query returned DB row:', status);
                return res.status(200).json({ quizStarted: status.started, currentRound: status.current_round });
            } catch (error) {
                console.error('Status query error:', error);
                return res.status(200).json({ quizStarted: false, currentRound: 0 });
            }
        }

        // --- USER: Submit Score (Transaction)
        if (req.method === 'POST' && action === 'submit') {
            const { teamName, answers, enterTime, exitTime, round } = req.body;
            const client = await sql.connect();
            try {
                await client.sql`BEGIN;`;
                const { rows } = await client.sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                const currentRound = rows[0]?.current_round || 0;
                if (currentRound < 1 || currentRound > 2) {
                    await client.sql`ROLLBACK;`;
                    return res.status(400).json({ error: `No active round (current: ${currentRound}) for submission` });
                }

                const now = Date.now();
                const fallbackEnter = enterTime || (now - 120000);
                const fallbackExit = exitTime || now;
                const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);

                const questions = await getQuestionsForRound(currentRound);
                let score = 0;
                if (answers && Array.isArray(answers) && questions.length > 0) {
                    answers.forEach((ans, index) => {
                        if (ans !== undefined && ans === questions[index]?.answer) score++;
                    });
                    console.log(`Partial scoring: ${score}/${questions.length} correct for Team ${teamName}`);
                } else {
                    console.warn(`Scoring warning: Invalid/old answers for Round ${currentRound} (type: ${typeof answers}) – Score 0`);
                    score = 0;
                }

                await client.sql`
                    INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                    VALUES (${currentRound}, ${teamName}, ${score}, to_timestamp(${fallbackEnter / 1000}), to_timestamp(${fallbackExit / 1000}), ${timeTaken})
                    ON CONFLICT (round, team_name) DO UPDATE SET
                        score = EXCLUDED.score, enter_time = EXCLUDED.enter_time, exit_time = EXCLUDED.exit_time, time_taken = EXCLUDED.time_taken
                `;
                await client.sql`COMMIT;`;
                console.log(`Insert success: Team ${teamName}, Round ${currentRound}, Score ${score}`);
                return res.status(200).json({ message: `Score ${score} submitted for Round ${currentRound}. Questions loaded: ${questions.length}` });
            } catch (error) {
                await client.sql`ROLLBACK;`;
                console.error('Submit transaction error:', error);
                return res.status(500).json({ error: 'Failed to save score', details: error.message });
            } finally {
                client.release();
            }
        }

        // --- USER: Disqualify (Transaction)
        if (req.method === 'POST' && action === 'disqualify') {
            const { teamName, enterTime, round } = req.body;
            const client = await sql.connect();
            try {
                await client.sql`BEGIN;`;
                const { rows } = await client.sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
                const currentRound = rows[0]?.current_round || 0;
                if (currentRound < 1 || currentRound > 2) {
                    await client.sql`ROLLBACK;`;
                    return res.status(400).json({ error: `No active round (current: ${currentRound}) for disqualification` });
                }

                const exitTime = Date.now();
                const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;

                await client.sql`
                    INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                    VALUES (${currentRound}, ${teamName}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                    ON CONFLICT (round, team_name) DO UPDATE SET
                        score = -1, enter_time = EXCLUDED.enter_time, exit_time = NOW(), time_taken = ${timeTaken}
                `;
                await client.sql`COMMIT;`;
                console.log(`Disqualify success: Team ${teamName}, Round ${currentRound}`);
                return res.status(200).json({ message: `Disqualified for Round ${currentRound}` });
            } catch (error) {
                await client.sql`ROLLBACK;`;
                console.error('Disqualify transaction error:', error);
                return res.status(500).json({ error: 'Failed to disqualify', details: error.message });
            } finally {
                client.release();
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
                    SELECT team_name, score, COALESCE(enter_time, submitted_at) as enter_time,
                           COALESCE(exit_time, submitted_at) as exit_time, COALESCE(time_taken, 0) as time_taken, submitted_at
                    FROM Scores WHERE round = ${queryRound}
                    ORDER BY CASE WHEN score < 0 THEN -999 ELSE score END DESC,
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

        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('Handler error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
