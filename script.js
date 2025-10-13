document.addEventListener('DOMContentLoaded', () => {
    // ... (previous container variables)
    const timerDisplay = document.getElementById('timer');
    let teamName = '';
    let quizCheckInterval;
    let countdown;

    // ... (team name submission logic is the same)

    // 2. Check quiz status
    async function checkQuizStatus() {
        try {
            const response = await fetch('/api/check-quiz-status');
            const data = await response.json();
            if (data.quizStarted) {
                clearInterval(quizCheckInterval);
                startQuiz(data.duration, data.startTime);
            }
        } catch (error) {
            console.error('Error checking quiz status:', error);
        }
    }

    function startQuizStatusCheck() {
        quizCheckInterval = setInterval(checkQuizStatus, 3000);
    }
    
    // 3. Start the quiz with timer
    async function startQuiz(duration, startTime) {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');

        setupTabSwitchDetection();
        startTimer(duration, startTime);

        try {
            const response = await fetch('questions.json');
            const questions = await response.json();
            renderQuestions(questions);
            submitBtn.classList.remove('hidden');
        } catch (error) {
            console.error('Error fetching questions:', error);
        }
    }

    // 4. Timer Logic
    function startTimer(duration, startTime) {
        const endTime = new Date(startTime).getTime() + duration * 1000;
        
        countdown = setInterval(() => {
            const now = new Date().getTime();
            const distance = endTime - now;

            if (distance < 0) {
                clearInterval(countdown);
                timerDisplay.textContent = "Time's up!";
                submitQuiz(true); // Auto-submit when time is up
                return;
            }

            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }, 1000);
    }

    // 5. Cheat Detection
    function setupTabSwitchDetection() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                disqualifyUser();
            }
        });
    }

    async function disqualifyUser() {
        clearInterval(countdown); // Stop timer
        document.removeEventListener('visibilitychange', setupTabSwitchDetection); // Prevent multiple triggers

        // Hide quiz and show disqualification message
        quizContainer.innerHTML = '<h1>You have been disqualified for switching tabs.</h1>';
        
        // Notify the server
        try {
            await fetch('/api/disqualify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamName }),
            });
        } catch (error) {
            console.error('Error disqualifying user:', error);
        }
    }
    
    // 6. Handle Quiz Submission
    async function submitQuiz(isAutoSubmit = false) {
        if (!isAutoSubmit && !quizForm.checkValidity()) {
            alert('Please answer all questions before submitting.');
            return;
        }

        clearInterval(countdown);
        const formData = new FormData(quizForm);
        const answers = {};
        for (const [key, value] of formData.entries()) {
            answers[key.replace('question', '')] = parseInt(value, 10);
        }

        try {
            const response = await fetch('/api/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamName, answers }),
            });

            if (response.ok) {
                showLeaderboard();
            } else {
                alert('Failed to submit answers.');
            }
        } catch (error) {
            console.error('Error submitting answers:', error);
        }
    }
    
    submitBtn.addEventListener('click', () => submitQuiz(false));

    // ... (renderQuestions and showLeaderboard logic is the same)
});
