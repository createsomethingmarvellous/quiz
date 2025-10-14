document.addEventListener('DOMContentLoaded', async () => {
    const leaderboardBody = document.getElementById('leaderboard-body');
    
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
    
    try {
        const response = await fetch('/api/quiz?action=leaderboard');
        const data = await response.json();
        
        leaderboardBody.innerHTML = '';
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
        leaderboardBody.innerHTML = '<tr><td colspan="6">Could not load leaderboard.</td></tr>';
    }
});
