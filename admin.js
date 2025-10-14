document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const QUIZ_DURATION_MINUTES = 2;

    // --- ELEMENTS ---
    const startRound1Btn = document.getElementById('start-round1-btn');
    const startRound2Btn = document.getElementById('start-round2-btn');
    const stopQuizBtn = document.getElementById('stop-quiz-btn');
    const roundSelector = document.getElementById('round-selector');
    const adminTimer = document.getElementById('admin-timer');
    const timerDisplay = document.getElementById('timer-display');
    const quizStatus = document.getElementById('quiz-status');
    const leaderboardBody = document.getElementById('leaderboard-body');
    let leaderboardInterval;
    let adminTimerInterval;
    let quizTimeLeft = QUIZ_DURATION_MINUTES * 60;
    let currentViewRound = 1; // Default view

    // --- HELPER FUNCTIONS ---
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

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

    function stopAdminTimer() {
        if (adminTimerInterval) {
            clearInterval(adminTimerInterval);
            adminTimerInterval = null;
        }
        timerDisplay.textContent = 'Quiz Stopped';
    }

    function startAdminTimer() {
        quizTimeLeft = QUIZ_DURATION_MINUTES * 60;
        adminTimerInterval = setInterval(() => {
            quizTimeLeft--;
            timerDisplay.textContent = `Time Left: ${formatTime(quizTimeLeft)}`;
            
            if (quizTimeLeft <= 0) {
                clearInterval(adminTimerInterval);
                timerDisplay.textContent = 'Quiz Ended';
                updateButtonsForInactive();
            }
        }, 1000);
    }

    async function fetchLeaderboard() {
        const round = currentViewRound;
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

    function updateButtonsForInactive() {
        startRound1Btn.disabled = false;
        startRound2Btn.disabled = false;
        startRound1Btn.textContent = 'Start Round 1 (Resets Round 1)';
        startRound2Btn.textContent = 'Start Round 2 (Resets Round 2)';
        stopQuizBtn.classList.add('hidden');
        adminTimer.classList.add('hidden');
        stopAdminTimer();
    }

    function updateButtonsForActive(currentRound) {
        startRound1Btn.disabled = true;
        startRound2Btn.disabled = true;
        startRound1Btn.textContent = `Round 1 In Progress - Start New to Reset`;
        startRound2Btn.textContent = `Round 2 In Progress - Start New to Reset`;
        stopQuizBtn.classList.remove('hidden');
        adminTimer.classList.remove('hidden');
        startAdminTimer();
        roundSelector.value = currentRound.toString(); // Switch view to current round
        currentViewRound = currentRound;
    }

    async function checkQuizStatus() {
        try {
            const response = await fetch('/api/quiz?action=status');
            const data = await response.json();
            if (data.quizStarted && data.currentRound > 0) {
                quizStatus.textContent = `Quiz Status: Active | Current Round: ${data.currentRound}`;
                updateButtonsForActive(data.currentRound);
            } else {
                quizStatus.textContent = 'Quiz Status: Not Started | Current Round: None';
                updateButtonsForInactive();
            }
        } catch (error) {
            console.error('Error checking initial status:', error);
            quizStatus.textContent = 'Quiz Status: Unknown | Current Round: None';
            updateButtonsForInactive();
        }
    }

    // --- EVENT LISTENERS ---
    startRound1Btn.addEventListener('click', async () => {
        if (!confirm('Start Round 1? This will reset Round 1 scores and times.')) return;
        try {
            const response = await fetch('/api/quiz?action=start&round=1', { method: 'POST' });
            if (response.ok) {
                alert('Round 1 started!');
                checkQuizStatus(); // Re-check to update UI
                fetchLeaderboard(); // Refresh for Round 1
            } else {
                alert('Failed to start Round 1.');
            }
        } catch (error) {
            console.error('Error starting Round 1:', error);
            alert('Error starting Round 1.');
        }
    });

    startRound2Btn.addEventListener('click', async () => {
        if (!confirm('Start Round 2? This will reset Round 2 scores and times.')) return;
        try {
            const response = await fetch('/api/quiz?action=start&round=2', { method: 'POST' });
            if (response.ok) {
                alert('Round 2 started!');
                checkQuizStatus(); // Re-check to update UI
                fetchLeaderboard(); // Refresh for Round 2
            } else {
                alert('Failed to start Round 2.');
            }
        } catch (error) {
            console.error('Error starting Round 2:', error);
            alert('Error starting Round 2.');
        }
    });

    stopQuizBtn.addEventListener('click', async () => {
        if (!confirm('Stop current round? Participants can finish, but new ones won\'t start.')) return;
        try {
            const response = await fetch('/api/quiz?action=stop', { method: 'POST' });
            if (response.ok) {
                alert('Quiz stopped.');
                checkQuizStatus(); // Re-check to update UI
            } else {
                alert('Failed to stop quiz.');
            }
        } catch (error) {
            console.error('Error stopping quiz:', error);
            alert('Error stopping quiz.');
        }
    });

    roundSelector.addEventListener('change', (e) => {
        currentViewRound = parseInt(e.target.value);
        fetchLeaderboard(); // Refresh for selected round
    });

    // --- INITIALIZATION ---
    checkQuizStatus();
    if (!leaderboardInterval) {
        leaderboardInterval = setInterval(fetchLeaderboard, 5000);
    }
    fetchLeaderboard();
});
