document.addEventListener('DOMContentLoaded', async () => {
    const leaderboardBody = document.getElementById('leaderboard-body');
    try {
        const response = await fetch('/api/quiz?action=leaderboard');
        const data = await response.json();
        
        leaderboardBody.innerHTML = '';
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
        leaderboardBody.innerHTML = '<tr><td colspan="3">Could not load leaderboard.</td></tr>';
    }
});
