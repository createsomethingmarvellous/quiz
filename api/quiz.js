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
    console.log('Running ensureTables migration...'); // Debug log

    // Create tables if they don't exist
    await sql`CREATE TABLE IF NOT EXISTS Scores (
        id SERIAL PRIMARY KEY,
        team_name VARCHAR(255) NOT NULL,
        round INT NOT NULL DEFAULT 1,
        score INT NOT NULL DEFAULT 0,
        submitted_at TIMESTAMP DEFAULT NOW()
    );`;
    
    await sql`CREATE TABLE IF NOT EXISTS QuizStatus (
        id INT PRIMARY KEY,
        started BOOLEAN NOT NULL DEFAULT FALSE,
        current_round INT NOT NULL DEFAULT 0
    );`;

    // Force-add missing columns (more aggressive migration)
    const scoreColumns = [
        { name: 'round', type: 'INT DEFAULT 1' },
        { name: 'enter_time', type: 'TIMESTAMP' },
        { name: 'exit_time', type: 'TIMESTAMP' },
        { name: 'time_taken', type: 'INT' }
    ];
    
    const statusColumns = [
        { name: 'current_round', type: 'INT DEFAULT 0' }
    ];

    // Add columns to Scores
    for (const col of scoreColumns) {
        try {
            await sql`ALTER TABLE Scores ADD COLUMN IF NOT EXISTS ${sql.raw(col.name)} ${sql.raw(col.type)};`;
            console.log(`Added/migrated Scores.${col.name}`); // Debug
        } catch (error) {
            console.log(`Scores.${col.name} already exists or migration skipped:`, error.message); // Ignore if exists
        }
    }

    // Add columns to QuizStatus
    for (const col of statusColumns) {
        try {
            await sql`ALTER TABLE QuizStatus ADD COLUMN IF NOT EXISTS ${sql.raw(col.name)} ${sql.raw(col.type)};`;
            console.log(`Added/migrated QuizStatus.${col.name}`); // Debug
        } catch (error) {
            console.log(`QuizStatus.${col.name} already exists or migration skipped:`, error.message);
        }
    }

    // Ensure QuizStatus row id=1 exists with defaults (FALSE, 0)
    await sql`
        INSERT INTO QuizStatus (id, started, current_round) 
        VALUES (1, FALSE, 0) 
        ON CONFLICT (id) DO UPDATE SET 
            started = EXCLUDED.started, 
            current_round = EXCLUDED.current_round
    `;
    console.log('QuizStatus row ensured (id=1).'); // Debug
};

export default async function handler(req, res) {
    const { action, round: queryRound } = req.query;
    const selectedRound = parseInt(queryRound) || 1;

    try {
        await ensureTables(); // Run migration on every request

        // --- ADMIN: Start Round 1 ---
        if (req.method === 'POST' && action === 'start' && selectedRound === 1) {
            console.log('Starting Round 1...'); // Debug
            await sql`DELETE FROM Scores WHERE round = 1;`; // Reset only Round 1
            await sql`
                INSERT INTO QuizStatus (id, started, current_round) 
                VALUES (1, TRUE, 1) 
                ON CONFLICT (id) DO UPDATE SET 
                    started = TRUE, 
                    current_round = 1
            `;
            console.log('Round 1 started and updated QuizStatus.'); // Debug
            return res.status(200).json({ message: 'Round 1 started and reset.' });
        }

        // --- ADMIN: Start Round 2 ---
        if (req.method === 'POST' && action === 'start' && selectedRound === 2) {
            console.log('Starting Round 2...'); // Debug
            await sql`DELETE FROM Scores WHERE round = 2;`; // Reset only Round 2
            await sql`
                INSERT INTO QuizStatus (id, started, current_round) 
                VALUES (1, TRUE, 2) 
                ON CONFLICT (id) DO UPDATE SET 
                    started = TRUE, 
                    current_round = 2
            `;
            console.log('Round 2 started and updated QuizStatus.'); // Debug
            return res.status(200).json({ message: 'Round 2 started and reset.' });
        }

        // --- ADMIN: Stop Quiz ---
        if (req.method === 'POST' && action === 'stop') {
            console.log('Stopping quiz...'); // Debug
            await sql`
                UPDATE QuizStatus SET started = FALSE WHERE id = 1
            `;
            console.log('Quiz stopped.'); // Debug
            return res.status(200).json({ message: 'Quiz stopped.' });
        }

        // --- USER: Check Quiz Status ---
        if (req.method === 'GET' && action === 'status') {
            console.log('Checking quiz status...'); // Debug
            const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
            const status = rows[0] || { started: false, current_round: 0 };
            console.log('Status query result:', status); // Debug
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
            console.log(`Sending questions for round ${currentRound}`); // Debug
            return res.status(200).json(questions);
        }

        // --- USER: Submit Score ---
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
        
        // --- USER: Disqualify ---
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

        // --- PUBLIC: Get Leaderboard ---
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

        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
