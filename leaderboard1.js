document.addEventListener('DOMContentLoaded', async () => {
    const leaderboardBody = document.getElementById('leaderboard-body');
    const leaderboardTitle = document.getElementById('leaderboard-title');
    
    // Helper functions (same as admin)
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
    
    try {
        // Step 1: Get current round from status
        const statusResponse = await fetch('/api/quiz?action=status');
        if (!statusResponse.ok) {
            throw new Error(`Status HTTP ${statusResponse.status}`);
        }
        const statusData = await statusResponse.json();
        const currentRound = statusData.currentRound || 0;
        
        if (currentRound < 1 || currentRound > 2) {
            leaderboardTitle.textContent = 'No Active Round';
            leaderboardBody.innerHTML = '<tr><td colspan="6">No quiz round is currently active. Check back later.</td></tr>';
            return;
        }
        
        leaderboardTitle.textContent = `Leaderboard - Round ${currentRound}`;
        
        // Step 2: Fetch leaderboard for current round
        const response = await fetch(`/api/quiz?action=leaderboard&round=${currentRound}`);
        if (!response.ok) {
            throw new Error(`Leaderboard HTTP ${response.status}`);
        }
        const result = await response.json();
        
        // Handle new API structure: { data: rows, round: X } or { error: '...' }
        if (result.error) {
            console.error(`API Error for Round ${currentRound}:`, result.error, result.details);
            leaderboardBody.innerHTML = `<tr><td colspan="6">Error loading Round ${currentRound}: ${result.error}</td></tr>`;
            return;
        }
        
        const data = result.data || []; // Extract data array
        console.log(`Public leaderboard fetched for Round ${result.round || currentRound}: ${data.length} entries`); // Debug log
        
        leaderboardBody.innerHTML = '';
        if (data.length === 0) {
            leaderboardBody.innerHTML = `<tr><td colspan="6">No data for Round ${result.round || currentRound} yet.</td></tr>`;
            return;
        }
        
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
        console.error('Error fetching public leaderboard:', error);
        leaderboardTitle.textContent = 'Error Loading Leaderboard';
        leaderboardBody.innerHTML = '<tr><td colspan="6">Could not load leaderboard. Please try again.</td></tr>';
    }
});
