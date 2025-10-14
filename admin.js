document.addEventListener('DOMContentLoaded', () => {
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const leaderboardBody = document.getElementById('leaderboard-body');
    let leaderboardInterval;

    // Helper to format time (ISO to readable)
    function formatTime(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Helper to format time taken (seconds to MM:SS)
    function formatTimeTaken(seconds) {
        if (seconds === null || seconds < 0) return 'N/A';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Start New Quiz
    startQuizBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to start a new quiz? This will delete all current scores and times.')) {
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
                let enterDisplay = formatTime(entry.enter_time);
                let exitDisplay = formatTime(entry.exit_time);
                let timeDisplay = formatTimeTaken(entry.time_taken);
                
                if (entry.score < 0) {
                    scoreDisplay = 'Disqualified';
                    enterDisplay = 'Disqualified';
                    exitDisplay = 'Disqualified';
                    timeDisplay = 'Disqualified';
                    row.classList.add('disqualified');
                }
                
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${entry.team_name}</td>
                    <td>${scoreDisplay}</td>
                    <td>${enterDisplay}</td>
                    <td>${exitDisplay}</td>
                    <td>${timeDisplay}</td>
                `;
            });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
        }
    }
    
    // Initial fetch
    fetchLeaderboard();
    leaderboardInterval = setInterval(fetchLeaderboard, 5000);
});
