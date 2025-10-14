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
    let questions = []; // Store loaded questions for rendering
    
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
            // Fetch round-specific questions for rendering (without answers)
            const questionsResponse = await fetch(`/questions_round${currentRound}.json`);
            if (!questionsResponse.ok) throw new Error('Questions not found');
            questions = await questionsResponse.json(); // Store for rendering
            renderQuestions(questions);
            startTimer(QUIZ_DURATION_MINUTES * 60);
        } catch (error) {
            console.error('Error fetching questions:', error);
            // Fallback: Hardcode sample questions for rendering (match backend options)
            questions = currentRound === 1 ? [
                { question: "What is 2+2?", options: ["3", "4", "5", "6"] },
                { question: "Capital of France?", options: ["Berlin", "Paris", "London", "Madrid"] },
                { question: "Largest planet?", options: ["Earth", "Mars", "Jupiter", "Saturn"] },
                { question: "Python founder?", options: ["Linus", "Guido", "Bill", "Steve"] },
                { question: "HTTP status OK?", options: ["200", "404", "500", "301"] }
            ] : [
                { question: "Unity engine type?", options: ["Game", "Web", "AR", "All"] },
                { question: "ARCore by?", options: ["Apple", "Google", "Meta", "Microsoft"] },
                { question: "JSON type?", options: ["XML", "Data", "Image", "Video"] },
                { question: "Vercel uses?", options: ["PHP", "Node.js", "Java", "C++"] },
                { question: "Postgres SQL?", options: ["NoSQL", "RDBMS", "Graph", "Key-Value"] }
            ];
            renderQuestions(questions);
            startTimer(QUIZ_DURATION_MINUTES * 60);
            console.log('Used fallback questions for rendering');
        }
    }
    
    // 4. Render Questions (value="${option}" for string sends; no 'required' for partial)
    function renderQuestions(questions) {
        quizForm.innerHTML = ''; // Clear form
        questions.forEach((q, index) => {
            const questionDiv = document.createElement('div');
            questionDiv.className = 'question';
            questionDiv.innerHTML = `<p>${index + 1}. ${q.question}</p>`;
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'options';
            q.options.forEach((option) => {
                // Sends actual option string (e.g., "Paris") to backend for correction
                optionsDiv.innerHTML += `<label><input type="radio" name="q${index}" value="${option}"> ${option}</label>`;
            });
            questionDiv.appendChild(optionsDiv);
            quizForm.appendChild(questionDiv);
        });
    }

    // 5. Timer (auto-submit partial on end)
    function startTimer(duration) {
        let timeLeft = duration;
        timerInterval = setInterval(() => {
            timeLeft--;
            const minutes = Math.floor(timeLeft / 60).toString().padStart(2, '0');
            const seconds = (timeLeft % 60).toString().padStart(2, '0');
            timerEl.textContent = `Time Left: ${minutes}:${seconds}`;

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                submitQuiz(true); // Auto-submit sends partial answers for correction
            }
        }, 1000);
    }

    // 6. Handle Submission (sends full answers array for backend correction)
    submitBtn.addEventListener('click', () => submitQuiz(false));

    async function submitQuiz(isAutoSubmit) {
        // Skip validity on auto-submit (allows partial – sends unanswered as undefined for correction)
        if (!isAutoSubmit && !quizForm.checkValidity()) {
            alert('Please answer all questions.');
            return;
        }
        
        clearInterval(timerInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        const exitTime = Date.now();
        
        // Collect answers as ARRAY (strings for answered; undefined for blanks – sends to backend for correction)
        const answers = new Array(questions.length).fill(undefined);
        quizForm.querySelectorAll('.question').forEach((questionDiv, index) => {
            const selectedRadio = questionDiv.querySelector('input[type="radio"]:checked');
            if (selectedRadio) {
                answers[index] = selectedRadio.value; // String: e.g., "4" or "Paris"
            }
            // Unanswered: Stays undefined → backend corrects as +0
        });
        console.log('Collected answers array sent for correction:', answers); // e.g., ["4", undefined, "Jupiter", ...]

        try {
            const response = await fetch('/api/quiz?action=submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    teamName, 
                    answers, // Full array sent for backend partial correction
                    enterTime, 
                    exitTime, 
                    round: currentRound 
                }),
            });
            
            if (!response.ok) {
                throw new Error(await response.text());
            }
            
            const result = await response.json();
            console.log('Backend correction result:', result.message); // e.g., "Score 2 submitted"

            // Parse real score from backend (after correction)
            const scoreMatch = result.message.match(/Score (\d+) submitted/);
            const score = scoreMatch ? scoreMatch[1] : 'Calculated';
            alert(isAutoSubmit ? `Time's up! Auto-submitted with score: ${score}` : `Submitted with score: ${score}`);
            
        } catch (error) {
            console.error('Error submitting answers for correction:', error);
            alert('Failed to submit. Please try again or contact admin.');
            return;
        } finally {
            quizContainer.classList.add('hidden');
            finishedContainer.classList.remove('hidden');
        }
    }

    // 7. Anti-Cheat: Tab Change Detection (sends disqualify without answers)
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
    