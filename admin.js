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


    // Fetch and display leaderboard for specific round (fixed for non-array data and response structure)
    async function fetchLeaderboard(targetRound = currentAdminRound) {
        // Guard: Skip if no active round overall (prevents pre-start fetch)
        try {
            const statusResponse = await fetch('/api/quiz?action=status');
            if (statusResponse.ok) {
                const status = await statusResponse.json();
                if (!status.quizStarted || status.currentRound === 0) {
                    console.log('Skipping leaderboard fetch: No active round.');
                    leaderboardBody.innerHTML = `<tr><td colspan="6">No active round. Start Round 1 or 2 to see leaderboard.</td></tr>`;
                    return;
                }
            }
        } catch (statusError) {
            console.warn('Could not check status for leaderboard guard:', statusError);
            // Proceed but log – don't block fetch
        }

        // Guard: Ensure valid round
        if (targetRound < 1 || targetRound > 2) {
            console.warn('Invalid round for fetch:', targetRound);
            leaderboardBody.innerHTML = `<tr><td colspan="6">Invalid round selected (${targetRound}). Please choose 1 or 2.</td></tr>`;
            return;
        }

        try {
            const response = await fetch(`/api/quiz?action=leaderboard&round=${targetRound}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText} - ${await response.text()}`);  // Include body for debug
            }
            const result = await response.json();
            
            // Robust parsing: Handle {data: [], round: X, message/error?}
            let data = [];
            let apiRound = targetRound;
            let apiMessage = '';
            let apiError = '';
            if (result && typeof result === 'object') {
                data = result.data;
                apiRound = result.round || targetRound;
                apiMessage = result.message || '';
                apiError = result.error || '';
                // CRITICAL FIX: Ensure data is always an array (handles non-array like {} / null / string)
                if (!Array.isArray(data)) {
                    console.warn(`Non-array data received for Round ${apiRound}:`, data, '(type:', typeof data, ') – forcing to []');
                    data = [];
                }
            } else {
                console.error('Invalid API response format:', result);
                throw new Error('Invalid response from API');
            }
            
            console.log(`Leaderboard fetched for Round ${apiRound}: ${data.length} entries`); // Debug log
            
            leaderboardBody.innerHTML = ''; // Clear old data

            // Handle no active round message
            if (apiMessage === 'No active round') {
                leaderboardBody.innerHTML = `<tr><td colspan="6">No active round for leaderboard (Round ${apiRound}). Start a round to see data.</td></tr>`;
                return;
            }

            // Handle API error (now 200 with {data: [], error: '...'})
            if (apiError) {
                console.error(`API Error for Round ${apiRound}:`, apiError, result.details);
                leaderboardBody.innerHTML = `<tr><td colspan="6">Error loading Round ${apiRound}: ${apiError} (Details: ${result.details || 'Unknown'}).</td></tr>`;
                return;
            }

            // FINAL GUARD: Double-check data is array before forEach (prevents TypeError)
            if (!Array.isArray(data)) {
                console.error('Critical: data is still not an array after parsing:', data, '(type:', typeof data, ')');
                leaderboardBody.innerHTML = `<tr><td colspan="6">Invalid data format received for Round ${apiRound}. Please refresh the page.</td></tr>`;
                return;
            }

            if (data.length === 0) {
                leaderboardBody.innerHTML = `<tr><td colspan="6">No data for Round ${apiRound} yet.</td></tr>`;
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
            console.error('Error fetching leaderboard for Round ' + targetRound + ':', error, 'URL:', `/api/quiz?action=leaderboard&round=${targetRound}`);
            leaderboardBody.innerHTML = `<tr><td colspan="6">Could not load leaderboard for Round ${targetRound}. (Error: ${error.message})</td></tr>`;
        }
    }


    // Check initial quiz status (updated to skip leaderboard if no active round)
    async function checkQuizStatus() {
        try {
            const response = await fetch('/api/quiz?action=status');
            if (!response.ok) throw new Error(`Status fetch failed: ${response.status}`);
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
                // Only fetch leaderboard if active
                fetchLeaderboard(currentAdminRound);
            } else {
                startRound1Btn.disabled = false;
                startRound2Btn.disabled = false;
                stopQuizBtn.classList.add('hidden');
                adminTimer.classList.add('hidden');
                if (adminTimerInterval) {
                    stopAdminTimer();
                }
                // No fetch here – set placeholder message instead
                leaderboardBody.innerHTML = `<tr><td colspan="6">Start a round to view leaderboard.</td></tr>`;
            }
        } catch (error) {
            console.error('Error checking initial status:', error);
            quizStatus.textContent = 'Quiz Status: Unknown | Current Round: None';
            // Fallback: Show no data message without fetch
            leaderboardBody.innerHTML = `<tr><td colspan="6">Unable to check status. Start a round to view leaderboard.</td></tr>`;
        }
    }


    // --- EVENT LISTENERS ---
    // Start Round 1
    startRound1Btn.addEventListener('click', async () => {
        if (!confirm('Start Round 1? This will reset Round 1 scores only.')) return;
        try {
            const response = await fetch('/api/quiz?action=start&round=1', { method: 'POST' });
            if (response.ok) {
                alert('Round 1 started!');
                checkQuizStatus(); // Update UI and leaderboard
            } else {
                alert('Failed to start Round 1.');
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
            if (response.ok) {
                alert('Round 2 started!');
                checkQuizStatus(); // Update UI and leaderboard
            } else {
                alert('Failed to start Round 2.');
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
            if (response.ok) {
                alert('Current round stopped.');
                checkQuizStatus(); // Update UI and leaderboard
            } else {
                alert('Failed to stop round.');
            }
        } catch (error) {
            console.error('Error stopping round:', error);
            alert('Error stopping round.');
        }
    });


    // Round Select Change (for admin leaderboard)
    roundSelect.addEventListener('change', (e) => {
        const selectedRound = parseInt(e.target.value);
        if (selectedRound >= 1 && selectedRound <= 2) {
            currentAdminRound = selectedRound;
            fetchLeaderboard(currentAdminRound);
        } else {
            console.warn('Invalid round selected from dropdown:', e.target.value);
        }
    });


    // --- INITIALIZATION ---
    checkQuizStatus();
    if (!leaderboardInterval) {
        const safeIntervalFetch = () => {
            if (currentAdminRound >= 1 && currentAdminRound <= 2) {
                fetchLeaderboard(currentAdminRound);
            } else {
                console.warn('Skipping interval: Invalid currentAdminRound', currentAdminRound);
            }
        };
        leaderboardInterval = setInterval(safeIntervalFetch, 5000);
        // Don't initial fetch here – handled by checkQuizStatus or events
    }
});
