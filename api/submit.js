import { sql } from '@vercel/postgres';
import questions from './questions.json' with { type: 'json' };
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    const { teamName, answers } = req.body;
    if (!teamName || !answers) return res.status(400).json({ error: 'Missing data' });
    try {
        const { rows: existing } = await sql`SELECT score FROM Scores WHERE team_name = ${teamName};`;
        if (existing.length > 0 && existing[0].score === -1) {
            return res.status(403).json({ message: 'User is disqualified.' });
        }
        let score = 0;
        questions.forEach((q, index) => {
            if (answers[index] !== undefined && parseInt(answers[index], 10) === q.answer) {
                score++;
            }
        });
        await sql`INSERT INTO Scores (team_name, score) VALUES (${teamName}, ${score}) ON CONFLICT (team_name) DO UPDATE SET score = ${score};`;
        return res.status(200).json({ message: 'Score submitted' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to submit score' });
    }
}
