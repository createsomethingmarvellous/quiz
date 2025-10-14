import { sql } from '@vercel/postgres';
import questionsRound1 from '../questions_round1.json' with { type: 'json' };
import questionsRound2 from '../questions_round2.json' with { type: 'json' };



// Helper to get questions by round
function getQuestionsForRound(round) {
    return round === 1 ? questionsRound1 : (round === 2 ? questionsRound2 : []);
}



// Helper to ensure tables exist and have all required columns
const ensureTables = async () => {
    // Create tables if they don't exist (include round in Scores)
    await sql`CREATE TABLE IF NOT EXISTS Scores (
        id SERIAL PRIMARY KEY,
        round INT NOT NULL,
        team_name VARCHAR(255) NOT NULL,
        score INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(round, team_name)
    );`;
    
    await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL DEFAULT FALSE,
        current_round INT DEFAULT 0
    );`;


    // Add missing columns (robust migration)
    const columnsToAdd = [
        { table: 'Scores', column: 'enter_time', type: 'TIMESTAMP' },
        { table: 'Scores', column: 'exit_time', type: 'TIMESTAMP' },
        { table: 'Scores', column: 'time_taken', type: 'INT' },
        { table: 'QuizStatus', column: 'current_round', type: 'INT DEFAULT 0' }
    ];


    for (const { table, column, type } of columnsToAdd) {
        try {
            const alterSQL = `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`;
            await sql.unsafe(alterSQL);
        } catch (error) {
            console.error(`Migration warning for ${table}.${column}:`, error.message);
            // If IF NOT EXISTS not supported, try without and catch
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


    // Add unique constraint on (round, team_name) if missing (required for ON CONFLICT)
    try {
        await sql`ALTER TABLE Scores ADD CONSTRAINT IF NOT EXISTS unique_round_team UNIQUE (round, team_name);`;
    } catch (constraintError) {
        console.error('Constraint migration warning:', constraintError.message);
        // Fallback: Try without IF NOT EXISTS
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


    // Set safe defaults for time columns (prevents query NULL issues)
    try {
        await sql`UPDATE Scores SET time_taken = 0 WHERE time_taken IS NULL;`;
        await sql`UPDATE Scores SET enter_time = submitted_at WHERE enter_time IS NULL;`;
        await sql`UPDATE Scores SET exit_time = submitted_at WHERE exit_time IS NULL;`;
    } catch (defaultError) {
        console.log('Time defaults already set or no data:', defaultError.message);
    }


    // Ensure QuizStatus default row
    await sql`INSERT INTO QuizStatus (id, started, current_round) VALUES (1, FALSE, 0) ON CONFLICT (id) DO NOTHING;`;


    // Verify and backfill round column if missing (post-migration check)
    try {
        const { rows } = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'Scores' AND column_name = 'round';`;
        if (rows.length === 0) {
            console.error('Critical: round column missing – adding now.');
            // Emergency add (since migration might have skipped)
            await sql.unsafe('ALTER TABLE Scores ADD COLUMN round INT NOT NULL DEFAULT 1;');
            // Backfill old rows
            await sql`UPDATE Scores SET round = 1 WHERE round IS NULL;`;
        } else {
            // If column exists but some rows NULL, backfill
            const { rows: nullCheck } = await sql`SELECT COUNT(*) as null_count FROM Scores WHERE round IS NULL;`;
            let nullCount = 0;
            if (nullCheck && nullCheck.length > 0 && nullCheck[0] && nullCheck[0].null_count !== undefined) {
                nullCount = parseInt(nullCheck[0].null_count, 10);
            }
            if (nullCount > 0) {
                await sql`UPDATE Scores SET round = 1 WHERE round IS NULL;`;
                console.log('Backfilled NULL rounds to 1.');
            }
        }
    } catch (error) {
        console.error('Error in round column verification/backfill:', error);
    }
};



export default async function handler(req, res) {
    const { action, round: queryRound } = req.query;


    try {
        await ensureTables(); // Ensure tables and columns


        const targetRound = parseInt(queryRound) || 0;


        // --- ADMIN: Start Round 1 ---
        if (req.method === 'POST' && action === 'start' && queryRound === '1') {
            try {
                await sql`DELETE FROM Scores WHERE round = 1;`;
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 1 WHERE id = 1;`;
                return res.status(200).json({ message: 'Round 1 started and scores reset.', currentRound: 1 });
            } catch (error) {
                console.error('Start Round 1 error:', error);
                return res.status(500).json({ error: 'Failed to start Round 1' });
            }
        }


        // --- ADMIN: Start Round 2 ---
        if (req.method === 'POST' && action === 'start' && queryRound === '2') {
            try {
                await sql`DELETE FROM Scores WHERE round = 2;`;
                await sql`UPDATE QuizStatus SET started = TRUE, current_round = 2 WHERE id = 1;`;
                return res.status(200).json({ message: 'Round 2 started and scores reset.', currentRound: 2 });
            } catch (error) {
                console.error('Start Round 2 error:', error);
                return res.status(500).json({ error: 'Failed to start Round 2' });
            }
        }


        // --- ADMIN: Stop Current Round ---
        if (req.method === 'POST' && action === 'stop') {
            const { rows: statusRows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = statusRows[0]?.current_round || 0;
            if (currentRound > 0) {
                await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
                return res.status(200).json({ message: `Round ${currentRound} stopped.`, currentRound });
            }
            return res.status(400).json({ message: 'No active round to stop.' });
        }


        // --- USER: Check Quiz Status ---
        if (req.method === 'GET' && action === 'status') {
            const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
            const status = rows.length > 0 ? rows[0] : { started: false, current_round: 0 };
            return res.status(200).json({ quizStarted: status.started, currentRound: status.current_round });
        }


        // --- USER: Submit Score ---
        if (req.method === 'POST' && action === 'submit') {
            const { teamName, answers, enterTime, exitTime, round } = req.body;
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 0;
            if (currentRound < 1 || currentRound > 2) {
                return res.status(400).json({ error: `No active round (current: ${currentRound}) for submission` });
            }
            
            const now = Date.now();
            const fallbackEnter = enterTime || (now - 120000);
            const fallbackExit = exitTime || now;
            const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);
            
            // Calculate score using imported questions
            const questions = getQuestionsForRound(currentRound);
            let score = 0;
            if (answers && questions.length > 0) {
                questions.forEach((q, index) => {
                    if (answers[index] !== undefined && answers[index] === q.answer) {
                        score++;
                    }
                });
            } else {
                console.warn(`Scoring warning: Questions empty or no answers for Round ${currentRound}`);
            }
            
            try {
                await sql`
                    INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                    VALUES (${currentRound}, ${teamName}, ${score}, to_timestamp(${fallbackEnter / 1000}), to_timestamp(${fallbackExit / 1000}), ${timeTaken})
                    ON CONFLICT (round, team_name) DO UPDATE SET
                        score = EXCLUDED.score,
                        enter_time = EXCLUDED.enter_time,
                        exit_time = EXCLUDED.exit_time,
                        time_taken = EXCLUDED.time_taken
                `;
                console.log(`Insert success: Team ${teamName}, Round ${currentRound}, Score ${score}`); // Log for debugging
                return res.status(200).json({ message: `Score ${score} submitted for Round ${currentRound}. Questions loaded: ${questions.length}` });
            } catch (insertError) {
                console.error('Insert error:', insertError);
                return res.status(500).json({ error: 'Failed to save score', details: insertError.message });
            }
        }
        
        // --- USER: Disqualify ---
        if (req.method === 'POST' && action === 'disqualify') {
            const { teamName, enterTime, round } = req.body;
            const { rows } = await sql`SELECT current_round FROM QuizStatus WHERE id = 1;`;
            const currentRound = rows[0]?.current_round || 0;
            if (currentRound < 1 || currentRound > 2) {
                return res.status(400).json({ error: `No active round (current: ${currentRound}) for disqualification` });
            }
            
            const exitTime = Date.now();
            const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;
            
            try {
                await sql`
                    INSERT INTO Scores (round, team_name, score, enter_time, exit_time, time_taken)
                    VALUES (${currentRound}, ${teamName}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                    ON CONFLICT (round, team_name) DO UPDATE SET
                        score = -1,
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


        // --- PUBLIC/ADMIN: Get Leaderboard (filtered by round) ---
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
                    SELECT team_name, score, enter_time, exit_time, time_taken, submitted_at
                    FROM Scores
                    WHERE round = ${queryRound}
                    ORDER BY 
                        CASE WHEN score < 0 THEN -999 ELSE score END DESC,
                        CASE WHEN score < 0 THEN NULL ELSE time_taken END ASC NULLS LAST,
                        submitted_at ASC
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
