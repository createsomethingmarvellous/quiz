document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const resetBtn = document.getElementById('reset-btn');
  const durationInput = document.getElementById('quiz-duration');
  const leaderboardBody = document.getElementById('leaderboard-body');
  let leaderboardInterval;

  startBtn.onclick = async () => {
    const duration = Math.max(30, Math.min(600, parseInt(durationInput.value, 10) || 120));
    try {
      await fetch('/api/admin/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationSeconds: duration }),
      });
      alert('Quiz started!');
      startLeaderboardUpdates();
    } catch {
      alert('Failed to start quiz');
    }
  };

  stopBtn.onclick = async () => {
    try {
      await fetch('/api/admin/stop', { method: 'POST' });
      alert('Quiz stopped!');
      stopLeaderboardUpdates();
    } catch {
      alert('Failed to stop quiz');
    }
  };

  resetBtn.onclick = async () => {
    if (confirm('Are you sure you want to reset all scores?')) {
      try {
        await fetch('/api/admin/reset', { method: 'POST' });
        alert('Scores reset!');
        stopLeaderboardUpdates();
        updateLeaderboard();
      } catch {
        alert('Failed to reset scores');
      }
    }
  };

  function startLeaderboardUpdates() {
    if (!leaderboardInterval) leaderboardInterval = setInterval(updateLeaderboard, 3000);
  }
  function stopLeaderboardUpdates() {
    if (leaderboardInterval) clearInterval(leaderboardInterval);
    leaderboardInterval = null;
  }
  async function updateLeaderboard() {
    try {
      const res = await fetch('/api/admin/leaderboard');
      const data = await res.json();
      leaderboardBody.innerHTML = '';
      data.forEach((entry, idx) => {
        const row = leaderboardBody.insertRow();
        row.innerHTML =
          `<td>${idx + 1}</td><td>${entry.team_name}</td><td>${entry.score < 0 ? 'Disqualified' : entry.score}</td>`;
      });
    } catch {}
  }

  updateLeaderboard();
});
