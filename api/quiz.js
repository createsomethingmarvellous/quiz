document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const QUIZ_DURATION_MINUTES = 2;

    // --- ELEMENTS ---
    const startRound1Btn = document.getElementById('start-round1-btn');
    const startRound2Btn = document.getElementById('start-round2-btn');
    const stopQuizBtn = document.getElementById('stop-quiz-btn');
    const adminTimer = document.getElementById('admin-timer');
    const timerDisplay = document.getElementById('timer-display');
    const quizStatus = document.getElementById('quiz-status');
    const roundSelect = document.getElementById('round-select');
    const leaderboardBody = document.getElementById('leaderboard-body');
    let leaderboardInterval;
    let adminTimerInterval;
    let quizTimeLeft = QUIZ_DURATION_MINUTES * 60;
    let currentAdminRound = 1; // Default to Round 1 for dropdown

    // --- HELPER FUNCTIONS ---
    // Format time (seconds to MM:SS)
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    // Format timestamp to readable time
    function formatTimeStamp(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Format time taken (seconds to MM:SS)
    function formatTimeTaken(seconds) {
        if (seconds === null || seconds < 0) return 'N/A';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // Stop admin timer
    function stopAdminTimer() {
        if (adminTimerInterval) {
            clearInterval(adminTimerInterval);
            adminTimerInterval = null;
        }
        timerDisplay.textContent = 'Quiz Stopped';
    }

    // Start admin timer countdown
    function startAdminTimer() {
        quizTimeLeft = QUIZ_DURATION_MINUTES * 60;
        adminTimerInterval = setInterval(() => {
            quizTimeLeft--;
            timerDisplay.textContent = `Time Left: ${formatTime(quizTimeLeft)}`;
            
            if (quizTimeLeft <= 0) {
                clearInterval(adminTimerInterval);
                timerDisplay.textContent = 'Quiz Ended';
                quizStatus.textContent = `Quiz Status: Ended | Current Round: ${currentAdminRound}`;
                stopQuizBtn.classList.add('hidden');
                startRound1Btn.disabled = false;
                startRound2Btn.disabled = false;
            }
        }, 1000);
    }

    // Fetch and display leaderboard for specific round (updated for new API format)
    async function fetchLeaderboard(targetRound = currentAdminRound) {
        try {
            const response = await fetch(`/api/quiz?action=leaderboard&round=${targetRound}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const result = await response.json();
            
            // Handle new API structure: { data: rows, round: X } or { error: '...' }
            if (result.error) {
                console.error(`API Error for Round ${targetRound}:`, result.error, result.details);
                leaderboardBody.innerHTML = `<tr><td colspan="6">Error loading Round ${targetRound}: ${result.error}</td></tr>`;
                return;
            }
            
            const data = result.data || []; // Extract data array
            console.log(`Leaderboard fetched for Round ${result.round || targetRound}: ${data.length} entries`); // Debug log
            
            leaderboardBody.innerHTML = ''; // Clear old data

            if (data.length === 0) {
                leaderboardBody.innerHTML = `<tr><td colspan="6">No data for this round yet (Round ${result.round || targetRound}).</td></tr>`;
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
            console.error('Error fetching leaderboard for Round ' + targetRound + ':', error);
            leaderboardBody.innerHTML = `<tr><td colspan="6">Could not load leaderboard for Round ${targetRound}.</td></tr>`;
        }
    }

    // Check initial quiz status
    async function checkQuizStatus() {
        try {
            const response = await fetch('/api/quiz?action=status');
            const data = await response.json();
            const statusText = data.quizStarted ? 'Active' : 'Not Started';
            const roundText = data.currentRound > 0 ? `Round ${data.currentRound}` : 'None';
            quizStatus.textContent = `Quiz Status: ${statusText} | Current Round: ${roundText}`;
            
            if (data.quizStarted && data.currentRound > 0) {
                currentAdminRound = data.currentRound;
                roundSelect.value = data.currentRound;
                startRound1Btn.disabled = true;
                startRound2Btn.disabled = true;
                stopQuizBtn.classList.remove('hidden');
                adminTimer.classList.remove('hidden');
                startAdminTimer();
            } else {
                startRound1Btn.disabled = false;
                startRound2Btn.disabled = false;
                stopQuizBtn.classList.add('hidden');
                adminTimer.classList.add('hidden');
                if (adminTimerInterval) {
                    stopAdminTimer();
                }
            }
        } catch (error) {
            console.error('Error checking initial status:', error);
            quizStatus.textContent = 'Quiz Status: Unknown | Current Round: None';
        }
    }

    // --- EVENT LISTENERS ---
    // Start Round 1
    startRound1Btn.addEventListener('click', async () => {
        if (!confirm('Start Round 1? This will reset Round 1 scores only.')) return;
        try {
            const response = await fetch('/api/quiz?action=start&round=1', { method: 'POST' });
            const result = await response.json();
            if (response.ok && !result.error) {
                alert('Round 1 started!');
                checkQuizStatus(); // Update UI
                fetchLeaderboard(1); // Show Round 1 leaderboard
            } else {
                alert(result.error || 'Failed to start Round 1.');
            }
        } catch (error) {
            console.error('Error starting Round 1:', error);
            alert('Error starting Round 1.');
        }
    });

    // Start Round 2
    startRound2Btn.addEventListener('click', async () => {
        if (!confirm('Start Round 2? This will reset Round 2 scores only.')) return;
        try {
            const response = await fetch('/api/quiz?action=start&round=2', { method: 'POST' });
            const result = await response.json();
            if (response.ok && !result.error) {
                alert('Round 2 started!');
                checkQuizStatus(); // Update UI
                fetchLeaderboard(2); // Show Round 2 leaderboard
            } else {
                alert(result.error || 'Failed to start Round 2.');
            }
        } catch (error) {
            console.error('Error starting Round 2:', error);
            alert('Error starting Round 2.');
        }
    });

    // Stop Current Round
    stopQuizBtn.addEventListener('click', async () => {
        if (!confirm('Stop current round? Active participants can finish.')) return;
        try {
            const response = await fetch('/api/quiz?action=stop', { method: 'POST' });
            const result = await response.json();
            if (response.ok && !result.error) {
                alert('Current round stopped.');
                checkQuizStatus(); // Update UI
                fetchLeaderboard(currentAdminRound); // Refresh current view
            } else {
                alert(result.error || 'Failed to stop round.');
            }
        } catch (error) {
            console.error('Error stopping round:', error);
            alert('Error stopping round.');
        }
    });

    // Round Select Change (for admin leaderboard)
    roundSelect.addEventListener('change', (e) => {
        currentAdminRound = parseInt(e.target.value);
        fetchLeaderboard(currentAdminRound);
    });

    // --- INITIALIZATION ---
    checkQuizStatus();
    if (!leaderboardInterval) {
        leaderboardInterval = setInterval(() => fetchLeaderboard(currentAdminRound), 5000);
    }
    fetchLeaderboard(1); // Initial load for Round 1
});
