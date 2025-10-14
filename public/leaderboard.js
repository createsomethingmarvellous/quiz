document.addEventListener('DOMContentLoaded', async () => {
    const leaderboardBody = document.getElementById('leaderboard-body');
    try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        
        leaderboardBody.innerHTML = '';
        const sortedData = data.filter(entry => entry.score !== -1); // Filter out disqualified

        sortedData.forEach((entry, index) => {
            const row = leaderboardBody.insertRow();
            row.innerHTML = `<td>${index + 1}</td><td>${entry.team_name}</td><td>${entry.score}</td>`;
        });
    } catch (error) {
        console.error('Failed to load leaderboard:', error);
    }
});
