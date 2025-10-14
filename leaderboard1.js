document.addEventListener('DOMContentLoaded', async () => {
    const leaderboardBody = document.getElementById('leaderboard-body');
    const roundSelector = document.getElementById('round-selector');
    let currentViewRound = 1;
    
    function formatTimeStamp(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatTimeTaken(seconds) {
        if (seconds === null || seconds < 0) return 'N/A';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    async function loadLeaderboard(round) {
        try {
            const response = await fetch(`/api/quiz?action=leaderboard&round=${round}`);
            const data = await response.json();
            
            leaderboardBody.innerHTML = '';
            data.forEach((entry, index) => {
                const row = leaderboardBody.insertRow();
                let scoreDisplay = entry.score;
                let enterDisplay = formatTimeStamp(entry.enter_time);
                let exitDisplay = formatTimeStamp(entry.exit_time);
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
            leaderboardBody.innerHTML = '<tr><td colspan="6">Could not load leaderboard for Round ' + round + '.</td></tr>';
        }
    }
    
    // Initial load for Round 1
    loadLeaderboard(currentViewRound);
    
    roundSelector.addEventListener('change', (e) => {
        currentViewRound = parseInt(e.target.value);
        loadLeaderboard(currentViewRound);
    });
});
