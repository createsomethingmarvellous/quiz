document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-quiz-btn');
    const resetBtn = document.getElementById('reset-quiz-btn');
    const leaderboardBody = document.getElementById('leaderboard-body');
    let leaderboardInterval;

    // Start Quiz
    startBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to start the quiz for all users?')) {
            try {
                await fetch('/api/start-quiz', { method: 'POST' });
                alert('Quiz started!');
                fetchLeaderboard(); // Initial fetch
                if (!leaderboardInterval) {
                    leaderboardInterval = setInterval(fetchLeaderboard, 5000); // Refresh every 5 seconds
                }
            } catch (error) {
                console.error('Error starting quiz:', error);
                alert('Failed to start quiz.');
            }
        }
    });

    // Reset Quiz
    resetBtn.addEventListener('click', async () => {
        if (confirm('WARNING: This will reset the entire quiz, including all scores and the waiting room. Proceed?')) {
            try {
                await fetch('/api/reset-quiz', { method: 'POST' });
                clearInterval(leaderboardInterval);
                leaderboardInterval = null;
                leaderboardBody.innerHTML = ''; // Clear table
                alert('Quiz has been reset.');
            } catch (error) {
                console.error('Error resetting quiz:', error);
                alert('Failed to reset quiz.');
            }
        }
    });

    // Fetch and display leaderboard
    async function fetchLeaderboard() {
        try {
            const response = await fetch('/api/leaderboard');
            const data = await response.json();
            leaderboardBody.innerHTML = ''; // Clear old data
            data.forEach((entry, index) => {
                const row = leaderboardBody.insertRow();
                const scoreCell = entry.score < 0 ? `<td style="color: red;">Disqualified</td>` : `<td>${entry.score}</td>`;
                row.innerHTML = `<td>${index + 1}</td><td>${entry.team_name}</td>${scoreCell}`;
            });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        }
    }
    
    // Initial load
    fetchLeaderboard();
});
