document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const QUIZ_DURATION_MINUTES = 2; // Matches participant duration

    // --- ELEMENTS ---
    const startQuizBtn = document.getElementById('start-quiz-btn');
    const stopQuizBtn = document.getElementById('stop-quiz-btn');
    const adminTimer = document.getElementById('admin-timer');
    const timerDisplay = document.getElementById('timer-display');
    const quizStatus = document.getElementById('quiz-status');
    const leaderboardBody = document.getElementById('leaderboard-body');
    let leaderboardInterval;
    let adminTimerInterval;
    let quizTimeLeft = QUIZ_DURATION_MINUTES * 60; // Start with full time

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
                quizStatus.textContent = 'Quiz Status: Ended';
                stopQuizBtn.classList.add('hidden'); // Hide stop button when ended
            }
        }, 1000);
    }

    // Fetch and display leaderboard
    async function fetchLeaderboard() {
        try {
            const response = await fetch('/api/quiz?action=leaderboard');
            const data = await response.json();
            
            leaderboardBody.innerHTML = ''; // Clear old data

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

    // Check initial quiz status (no auto-start)
    async function checkQuizStatus() {
        try {
            const response = await fetch('/api/quiz?action=status');
            const data = await response.json();
            if (data.quizStarted) {
                quizStatus.textContent = 'Quiz Status: Active';
                startQuizBtn.disabled = true;
                startQuizBtn.textContent = 'Quiz In Progress - Start New One to Reset';
                stopQuizBtn.classList.remove('hidden'); // Show stop button
                adminTimer.classList.remove('hidden');
                startAdminTimer(); // Start timer if already active
            } else {
                quizStatus.textContent = 'Quiz Status: Not Started';
                startQuizBtn.disabled = false;
                startQuizBtn.textContent = 'Start New Quiz (Resets Leaderboard)';
                stopQuizBtn.classList.add('hidden'); // Hide stop button
                adminTimer.classList.add('hidden');
                if (adminTimerInterval) {
                    stopAdminTimer(); // Stop if running
                }
            }
        } catch (error) {
            console.error('Error checking initial status:', error);
            quizStatus.textContent = 'Quiz Status: Unknown';
        }
    }

    // --- EVENT LISTENERS ---
    startQuizBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to start a new quiz? This will delete all current scores and times.')) {
            return;
        }

        try {
            const response = await fetch('/api/quiz?action=start', { method: 'POST' });
            if (response.ok) {
                alert('Quiz started successfully! The waiting room is now open for participants.');
                
                // Update UI
                startQuizBtn.disabled = true;
                startQuizBtn.textContent = 'Quiz In Progress - Start New One to Reset';
                quizStatus.textContent = 'Quiz Status: Active';
                stopQuizBtn.classList.remove('hidden'); // Show stop button
                adminTimer.classList.remove('hidden');
                
                // Start timer and leaderboard refresh
                startAdminTimer();
                fetchLeaderboard(); // Fetch immediately
                
                if (!leaderboardInterval) {
                    leaderboardInterval = setInterval(fetchLeaderboard, 5000); // Refresh every 5 seconds
                }
            } else {
                alert('Failed to start quiz.');
            }
        } catch (error) {
            console.error('Error starting quiz:', error);
            alert('Error starting quiz. Please try again.');
        }
    });

    // Stop Quiz Button
    stopQuizBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to stop the quiz? Participants already in the quiz can finish, but new ones won\'t be able to start.')) {
            return;
        }

        try {
            const response = await fetch('/api/quiz?action=stop', { method: 'POST' });
            if (response.ok) {
                alert('Quiz stopped successfully.');
                
                // Update UI
                stopAdminTimer();
                quizStatus.textContent = 'Quiz Status: Stopped';
                stopQuizBtn.classList.add('hidden'); // Hide stop button
                startQuizBtn.disabled = false;
                startQuizBtn.textContent = 'Start New Quiz (Resets Leaderboard)';
            } else {
                alert('Failed to stop quiz.');
            }
        } catch (error) {
            console.error('Error stopping quiz:', error);
            alert('Error stopping quiz. Please try again.');
        }
    });

    // --- INITIALIZATION ---
    // Check if quiz is already active on load
    checkQuizStatus();
    
    // Always start leaderboard polling (even if not started, shows empty)
    if (!leaderboardInterval) {
        leaderboardInterval = setInterval(fetchLeaderboard, 5000);
    }
    
    // Initial leaderboard fetch
    fetchLeaderboard();
});
