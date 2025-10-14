document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const QUIZ_DURATION_MINUTES = 2;

    // --- ELEMENTS ---
    const teamNameContainer = document.getElementById('team-name-container');
    const waitingRoom = document.getElementById('waiting-room');
    const quizContainer = document.getElementById('quiz-container');
    const finishedContainer = document.getElementById('finished-container');
    const disqualifiedContainer = document.getElementById('disqualified-container');
    const timerEl = document.getElementById('timer');
    const roundInfoEl = document.getElementById('round-info');
    const joinBtn = document.getElementById('join-btn');
    const teamNameInput = document.getElementById('team-name-input');
    const quizForm = document.getElementById('quiz-form');
    const submitBtn = document.getElementById('submit-btn');

    // --- STATE ---
    let teamName = '';
    let currentRound = 0;
    let enterTime = null;
    let quizCheckInterval;
    let timerInterval;
    let hasBeenDisqualified = false;
    let questions = []; // Store loaded questions for answer collection
    
    // 1. Join Quiz
    joinBtn.addEventListener('click', () => {
        teamName = teamNameInput.value.trim();
        if (teamName) {
            teamNameContainer.classList.add('hidden');
            waitingRoom.classList.remove('hidden');
            startQuizStatusCheck();
        } else {
            alert('Please enter a team name.');
        }
    });

    // 2. Check for quiz start
    function startQuizStatusCheck() {
        quizCheckInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/quiz?action=status');
                const data = await response.json();
                if (data.quizStarted && data.currentRound > 0) {
                    currentRound = data.currentRound;
                    clearInterval(quizCheckInterval);
                    startQuiz();
                }
            } catch (error) {
                console.error('Error checking quiz status:', error);
            }
        }, 3000);
    }
    
    // 3. Start the quiz
    async function startQuiz() {
        waitingRoom.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        
        enterTime = Date.now();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        roundInfoEl.textContent = `Round ${currentRound}`;
        try {
            // Fetch round-specific questions
            const questionsResponse = await fetch(`questions_round${currentRound}.json`);
            questions = await questionsResponse.json(); // Store globally for scoring
            renderQuestions(questions);
            startTimer(QUIZ_DURATION_MINUTES * 60);
        } catch (error) {
            console.error('Error fetching questions:', error);
            alert('Error loading questions. Please refresh.');
        }
    }
    
    // 4. Render Questions (FIX: No 'required' to allow blanks/partial)
    function renderQuestions(questions) {
        quizForm.innerHTML = ''; // Clear form
        questions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';
            questionDiv.innerHTML = `<p>${index + 1}. ${q.question}</p>`;
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            q.options.forEach((option, i) => {
                // FIX: Remove 'required' – allows blanks for partial scoring
                optionsDiv.innerHTML += `<label><input type="radio" name="q${index}" value="${i}"> ${option}</label>`;
            });
            questionDiv.appendChild(optionsDiv);
            quizForm.appendChild(questionDiv);
        });
    }

    // 5. Timer (Unchanged, but calls auto-submit on end)
    function startTimer(duration) {
        let timeLeft = duration;
        timerInterval = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const seconds = (timeLeft % 60).toString().padStart(2, '0');
            timerEl.textContent = `Time Left: ${minutes}:${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submitQuiz(true); // Auto-submit partial (isAutoSubmit=true)
            }
        }, 1000);
    }

    // 6. Handle Submission (FIX: Skip validity on auto, collect as array for backend)
    submitBtn.addEventListener('click', () => submitQuiz(false));

    async function submitQuiz(isAutoSubmit) {
        // FIX: Skip form validity check on auto-submit (allows partial/blanks)
        if (!isAutoSubmit && !quizForm.checkValidity()) {
            alert('Please answer all questions.');
            return;
        }
        
        clearInterval(timerInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        const exitTime = Date.now();
        
        // FIX: Collect answers as ARRAY (full length, undefined for blanks)
        // Backend expects [val0, val1, ..., undefined] for scoring loop
        const answers = new Array(questions.length).fill(undefined);
        quizForm.querySelectorAll('.question').forEach((questionDiv, index) => {
            const selectedRadio = questionDiv.querySelector('input[type="radio"]:checked');
            if (selectedRadio) {
                answers[index] = parseInt(selectedRadio.value, 10);
            }
            // Blanks stay undefined → scores 0 in backend
        });
        console.log('Collected answers array:', answers); // Debug: e.g., [0, undefined, 2, 1, undefined]

        try {
            const response = await fetch('/api/quiz?action=submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    teamName, 
                    answers, // Now array for partial scoring
                    enterTime, 
                    exitTime, 
                    round: currentRound 
                }),
            });
            
            if (!response.ok) {
                throw new Error(await response.text());
            }
            
            const result = await response.json();
            console.log('Submit success:', result.message); // e.g., "Score 3 submitted"
            
            // Optional: Show score in alert (partial correct only)
            const scoreMatch = result.message.match(/Score (\d+) submitted/);
            const score = scoreMatch ? scoreMatch[1] : 'Calculated';
            alert(isAutoSubmit ? `Time's up! Auto-submitted with score: ${score}` : `Submitted with score: ${score}`);
            
        } catch (error) {
            console.error('Error submitting answers:', error);
            alert('Failed to submit. Please try again or contact admin.');
            // On error, don't show finished – stay in quiz or retry
            return;
        } finally {
            quizContainer.classList.add('hidden');
            finishedContainer.classList.remove('hidden');
        }
    }

    // 7. Anti-Cheat: Tab Change Detection (Unchanged)
    async function handleVisibilityChange() {
        if (document.hidden && !hasBeenDisqualified && enterTime) {
            hasBeenDisqualified = true;
            clearInterval(timerInterval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            
            const exitTime = Date.now();
            
            try {
                await fetch('/api/quiz?action=disqualify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ teamName, enterTime, round: currentRound }),
                });
            } catch (error) {
                console.error('Failed to disqualify:', error);
            } finally {
                quizContainer.classList.add('hidden');
                disqualifiedContainer.classList.remove('hidden');
            }
        }
    }
});
