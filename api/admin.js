document.addEventListener('DOMContentLoaded', () => {
    const startQuizForm = document.getElementById('start-quiz-form');
    const quizDurationInput = document.getElementById('quiz-duration');
    const leaderboardContainer = document.getElementById('leaderboard-container');
    const leaderboardBody = document.getElementById('leaderboard-body');
    let leaderboardInterval;

    startQuizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const duration = parseInt(quizDurationInput.value, 10);
        if (duration > 0) {
            try {
                const response = await fetch('/api/start-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ duration: duration * 60 }), // Send duration in seconds
                });
                if (response.ok) {
                    alert('Quiz started!');
                    document.getElementById('start-quiz-container').classList.add('hidden');
                    leaderboardContainer.classList.remove('hidden');
                    startLeaderboardUpdates();
                } else {
                    alert('Failed to start quiz.');
                }
            } catch (error) {
                console.error('Error starting quiz:', error);
            }
        }
    });

    function startLeaderboardUpdates() {
        fetchLeaderboard(); // Fetch immediately
        leaderboardInterval = setInterval(fetchLeaderboard, 5000); // Refresh every 5 seconds
    }

    async function fetchLeaderboard() {
        try {
            const response = await fetch('/api/leaderboard');
            const data = await response.json();
            
            leaderboardBody.innerHTML = '';
            data.forEach((entry, index) => {
                const row = leaderboardBody.insertRow();
                const status = entry.disqualified ? 'Disqualified' : 'Finished';
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${entry.team_name}</td>
                    <td>${entry.score}</td>
                    <td>${status}</td>
                `;
            });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        }
    }
});
