import { sql } from '@vercel/postgres';
import questions1 from '../questions1.json' with { type: 'json' };
import questions2 from '../questions2.json' with { type: 'json' };

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
        current_round INT DEFAULT 0
    );`;

    // Add missing columns if they don't exist (for migration)
    const scoreColumns = [
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS round INT DEFAULT 1',
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS enter_time TIMESTAMP',
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS exit_time TIMESTAMP',
        'ALTER TABLE Scores ADD COLUMN IF NOT EXISTS time_taken INT'
    ];
    
    const statusColumns = [
        'ALTER TABLE QuizStatus ADD COLUMN IF NOT EXISTS current_round INT DEFAULT 0'
    ];

    // Add to Scores
    for (const columnSQL of scoreColumns) {
        try {
            await sql.unsafe(columnSQL);
        } catch (colError) {
            console.log('Score column may already exist:', colError.message);
        }
    }

    // Add to QuizStatus
    for (const columnSQL of statusColumns) {
        try {
            await sql.unsafe(columnSQL);
        } catch (colError) {
            console.log('Status column may already exist:', colError.message);
        }
    }

    // Ensure QuizStatus has a default row
    await sql`INSERT INTO QuizStatus (id, started, current_round) VALUES (1, FALSE, 0) ON CONFLICT (id) DO NOTHING;`;
};

export default async function handler(req, res) {
    const { action, round } = req.query;
    const roundNum = parseInt(round) || 1; // Default to 1 if not specified

    try {
        await ensureTables(); // Ensure tables exist with all columns

        // --- ADMIN: Start Specific Round & Reset That Round's Scores ---
        if (req.method === 'POST' && action === 'start') {
            if (roundNum < 1 || roundNum > 2) {
                return res.status(400).json({ message: 'Invalid round (must be 1 or 2).' });
            }

            // Stop any active round first
            await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;

            // Reset scores for this round only
            await sql`DELETE FROM Scores WHERE round = ${roundNum};`;

            // Set new round active
            await sql`UPDATE QuizStatus SET started = TRUE, current_round = ${roundNum} WHERE id = 1;`;

            return res.status(200).json({ message: `Round ${roundNum} started and scores reset.` });
        }

        // --- ADMIN: Stop Quiz (Current Round) ---
        if (req.method === 'POST' && action === 'stop') {
            await sql`UPDATE QuizStatus SET started = FALSE WHERE id = 1;`;
            return res.status(200).json({ message: 'Current round stopped.' });
        }

        // --- USER/ADMIN: Check Quiz Status ---
        if (req.method === 'GET' && action === 'status') {
            const { rows } = await sql`SELECT started, current_round FROM QuizStatus WHERE id = 1;`;
            const statusRow = rows[0] || { started: false, current_round: 0 };
            return res.status(200).json({ 
                quizStarted: statusRow.started, 
                currentRound: statusRow.current_round || 0 
            });
        }

        // --- USER: Get Questions for Round ---
        if (req.method === 'GET' && action === 'questions') {
            if (roundNum < 1 || roundNum > 2) {
                return res.status(400).json({ message: 'Invalid round.' });
            }
            const questions = roundNum === 1 ? questions1 : questions2;
            return res.status(200).json(questions);
        }

        // --- USER: Submit Score for Current Round ---
        if (req.method === 'POST' && action === 'submit') {
            const { teamName, answers, enterTime, exitTime } = req.body;
            const now = Date.now();
            const fallbackEnter = enterTime || (now - 120000);
            const fallbackExit = exitTime || now;
            const timeTaken = Math.floor((fallbackExit - fallbackEnter) / 1000);
            
            let score = 0;
            const questions = roundNum === 1 ? questions1 : questions2;
            if (answers) {
                questions.forEach((q, index) => {
                    if (answers[index] === q.answer) {
                        score++;
                    }
                });
            }
            
            await sql`
                INSERT INTO Scores (team_name, round, score, enter_time, exit_time, time_taken)
                VALUES (${teamName}, ${roundNum}, ${score}, to_timestamp(${fallbackEnter / 1000}), to_timestamp(${fallbackExit / 1000}), ${timeTaken})
                ON CONFLICT (team_name, round) DO UPDATE SET
                    score = EXCLUDED.score,
                    enter_time = EXCLUDED.enter_time,
                    exit_time = EXCLUDED.exit_time,
                    time_taken = EXCLUDED.time_taken
            `;
            return res.status(200).json({ message: 'Score submitted.' });
        }
        
        // --- USER: Disqualify for Current Round ---
        if (req.method === 'POST' && action === 'disqualify') {
            const { teamName, enterTime } = req.body;
            const exitTime = Date.now();
            const timeTaken = enterTime ? Math.floor((exitTime - enterTime) / 1000) : 0;
            
            await sql`
                INSERT INTO Scores (team_name, round, score, enter_time, exit_time, time_taken)
                VALUES (${teamName}, ${roundNum}, -1, to_timestamp(${(enterTime || (exitTime - 60000)) / 1000}), NOW(), ${timeTaken})
                ON CONFLICT (team_name, round) DO UPDATE SET
                    score = -1,
                    exit_time = NOW(),
                    time_taken = ${timeTaken}
            `;
            return res.status(200).json({ message: 'User disqualified.' });
        }

        // --- PUBLIC/ADMIN: Get Leaderboard for Specific Round (with tie-breaker) ---
        if (req.method === 'GET' && action === 'leaderboard') {
            if (roundNum < 1 || roundNum > 2) {
                return res.status(400).json({ message: 'Invalid round.' });
            }
            try {
                const { rows } = await sql`
                    SELECT team_name, score, enter_time, exit_time, time_taken
                    FROM Scores
                    WHERE round = ${roundNum}
                    ORDER BY 
                        CASE WHEN score < 0 THEN -999 ELSE score END DESC,
                        CASE WHEN score < 0 THEN NULL ELSE time_taken END ASC NULLS LAST,
                        submitted_at ASC
                `;
                return res.status(200).json(rows);
            } catch (error) {
                console.error('Leaderboard query error:', error);
                return res.status(200).json([]); // Fallback
            }
        }

        // If no route matches
        return res.status(404).json({ message: 'Not Found' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}
