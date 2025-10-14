document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-btn');
    const resetBtn = document.getElementById('reset-btn');
    const durationInput = document.getElementById('quiz-duration');
    const leaderboardBody = document.getElementById('leaderboard-body');
    const statusText = document.getElementById('status');
    let leaderboardInterval;

    // Start Quiz
    startBtn.addEventListener('click', async () => {
        const duration = parseInt(durationInput.value, 10) * 60; // Convert minutes to seconds
        if (isNaN(duration) || duration <= 0) {
            alert('Please enter a valid duration.');
            return;
        }

        try {
            await fetch('/api/start-quiz', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ duration }),
            });
            statusText.textContent = 'Status: Quiz is running!';
            startLeaderboardUpdates();
        } catch (error) {
            console.error('Failed to start quiz:', error);
            alert('Error starting quiz.');
        }
    });

    // Reset Quiz and Leaderboard
    resetBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to reset all scores and end the current quiz?')) {
            return;
        }
        try {
            await fetch('/api/reset-quiz', { method: 'POST' });
            statusText.textContent = 'Status: Quiz has been reset.';
            stopLeaderboardUpdates();
            leaderboardBody.innerHTML = ''; // Clear table
            alert('Quiz and leaderboard have been reset.');
        } catch (error) {
            console.error('Failed to reset quiz:', error);
            alert('Error resetting quiz.');
        }
    });

    // Fetch and display leaderboard
    async function updateLeaderboard() {
        try {
            const response = await fetch('/api/leaderboard');
            const data = await response.json();
            
            leaderboardBody.innerHTML = ''; // Clear old data
            data.forEach((entry, index) => {
                const row = leaderboardBody.insertRow();
                let scoreDisplay = entry.score;
                if (entry.score === -1) {
                    scoreDisplay = 'Disqualified';
                    row.style.textDecoration = 'line-through';
                }
                row.innerHTML = `<td>${index + 1}</td><td>${entry.team_name}</td><td>${scoreDisplay}</td>`;
            });
        } catch (error) {
            console.error('Failed to update leaderboard:', error);
        }
    }
    
    function startLeaderboardUpdates() {
        updateLeaderboard(); // Initial fetch
        if (!leaderboardInterval) {
            leaderboardInterval = setInterval(updateLeaderboard, 5000); // Update every 5 seconds
        }
    }

    function stopLeaderboardUpdates() {
        clearInterval(leaderboardInterval);
        leaderboardInterval = null;
    }
    
    // Check initial state on page load
    async function checkInitialStatus() {
        const response = await fetch('/api/check-quiz-status');
        const data = await response.json();
        if (data.quizStarted) {
            statusText.textContent = 'Status: Quiz is running!';
            startLeaderboardUpdates();
        }
    }
    
    checkInitialStatus();
});
