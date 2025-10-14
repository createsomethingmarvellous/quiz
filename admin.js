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
    let currentSelectedRound = 1; // Default to Round 1 for leaderboard

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
                timerDisplay.textContent = 'Round Ended';
                quizStatus.textContent = `Quiz Status: Ended (Round ${currentRound})`;
                stopQuizBtn.classList.add('hidden');
                startRound1Btn.disabled = false;
                startRound2Btn.disabled = false;
            }
        }, 1000);
    }

    // Fetch leaderboard for specific round
    async function fetchLeaderboard(round) {
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
            leaderboardBody.innerHTML = '<tr><td colspan="6">Could not load leaderboard.</td></tr>';
        }
    }

    // Check initial quiz status
    let currentRound = 0;
    async function checkQuizStatus() {
        try {
            const response = await fetch('/api/quiz?action=status');
            const data = await response.json();
            currentRound = data.currentRound || 0;
            if (data.quizStarted && currentRound > 0) {
                quizStatus.textContent = `Quiz Status: Active (Round ${currentRound})`;
                startRound1Btn.disabled = currentRound === 1;
                startRound2Btn.disabled = currentRound === 2;
                stopQuizBtn.classList.remove('hidden');
                adminTimer.classList.remove('hidden');
                roundSelector.value = currentRound.toString();
                startAdminTimer();
            } else {
                quizStatus.textContent = 'Quiz Status: Not Started (Round 0)';
                startRound1Btn.disabled = false;
                startRound2Btn.disabled = false;
                stopQuizBtn.classList.add('hidden');
                adminTimer.classList.add('hidden');
                stopAdminTimer();
            }
        } catch (error) {
            console.error('Error checking initial status:', error);
            quizStatus.textContent = 'Quiz Status: Unknown';
        }
    }

    // --- EVENT LISTENERS ---
    startRound1Btn.addEventListener('click', async () => {
        if (!confirm('Start Round 1? This resets Round 1 scores.')) return;
        try {
            const response = await fetch('/api/quiz?action=start&round=1', { method: 'POST' });
            if (response.ok) {
                alert('Round 1 started!');
                currentRound = 1;
                updateUIForRound(1);
                roundSelector.value = '1';
                fetchLeaderboard(1);
            } else {
                alert('Failed to start Round 1.');
            }
        } catch (error) {
            console.error('Error starting Round 1:', error);
        }
    });

    startRound2Btn.addEventListener('click', async () => {
        if (!confirm('Start Round 2? This resets Round 2 scores (stops Round 1 if active).')) return;
        try {
            const response = await fetch('/api/quiz?action=start&round=2', { method: 'POST' });
            if (response.ok) {
                alert('Round 2 started!');
                currentRound = 2;
                updateUIForRound(2);
                roundSelector.value = '2';
                fetchLeaderboard(2);
            } else {
                alert('Failed to start Round 2.');
            }
        } catch (error) {
            console.error('Error starting Round 2:', error);
        }
    });

    stopQuizBtn.addEventListener('click', async () => {
        if (!confirm('Stop current round?')) return;
        try {
            const response = await fetch('/api/quiz?action=stop', { method: 'POST' });
            if (response.ok) {
                alert('Current round stopped.');
                currentRound = 0;
                updateUIForRound(0);
                stopAdminTimer();
            } else {
                alert('Failed to stop.');
            }
        } catch (error) {
            console.error('Error stopping quiz:', error);
        }
    });

    roundSelector.addEventListener('change', (e) => {
        currentSelectedRound = parseInt(e.target.value);
        fetchLeaderboard(currentSelectedRound);
    });

    function updateUIForRound(round) {
        quizStatus.textContent = round > 0 ? `Quiz Status: Active (Round ${round})` : 'Quiz Status: Not Started (Round 0)';
        startRound1Btn.disabled = round === 1;
        startRound2Btn.disabled = round === 2;
        stopQuizBtn.classList.toggle('hidden', round === 0);
        if (round > 0) {
            adminTimer.classList.remove('hidden');
            startAdminTimer();
        } else {
            adminTimer.classList.add('hidden');
            stopAdminTimer();
        }
    }

    // --- INITIALIZATION ---
    checkQuizStatus();
    
    if (!leaderboardInterval) {
        leaderboardInterval = setInterval(() => fetchLeaderboard(currentSelectedRound), 5000);
    }
    
    fetchLeaderboard(1); // Initial fetch for Round 1
});
