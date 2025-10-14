document.addEventListener('DOMContentLoaded', () => {
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const leaderboardBody = document.getElementById('leaderboard-body');
    let leaderboardInterval;

    // Start New Quiz
    startQuizBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to start a new quiz? This will delete all current scores.')) {
            return;
        }

        try {
            const response = await fetch('/api/quiz?action=start', { method: 'POST' });
            if (response.ok) {
                alert('Quiz started successfully! The waiting room is now open.');
                fetchLeaderboard(); // Fetch immediately
                if (!leaderboardInterval) {
                    leaderboardInterval = setInterval(fetchLeaderboard, 5000); // Refresh every 5 seconds
                }
            } else {
                alert('Failed to start quiz.');
            }
        } catch (error) {
            console.error('Error starting quiz:', error);
        }
    });

    // Fetch and display leaderboard
    async function fetchLeaderboard() {
        try {
            const response = await fetch('/api/quiz?action=leaderboard');
            const data = await response.json();
            
            leaderboardBody.innerHTML = ''; // Clear old data

            data.forEach((entry, index) => {
                const row = leaderboardBody.insertRow();
                let scoreDisplay = entry.score;
                if (entry.score < 0) {
                    scoreDisplay = 'Disqualified';
                    row.classList.add('disqualified');
                }
                row.innerHTML = `<td>${index + 1}</td><td>${entry.team_name}</td><td>${scoreDisplay}</td>`;
            });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        }
    }
    
    // Initial fetch
    fetchLeaderboard();
    leaderboardInterval = setInterval(fetchLeaderboard, 5000);
});
