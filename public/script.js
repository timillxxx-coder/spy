let ws;
let username;
let lobbyId;

// DOM
const loginDiv = document.getElementById('login');
const lobbyDiv = document.getElementById('lobby');
const gameDiv = document.getElementById('game');

const lobbyIdSpan = document.getElementById('lobbyId');
const creatorSpan = document.getElementById('creator');
const playersList = document.getElementById('players');
const startBtn = document.getElementById('startBtn');
const roleText = document.getElementById('role');
const progressText = document.getElementById('progress');
const resultText = document.getElementById('result');

document.getElementById('loginBtn').onclick = login;
document.getElementById('voteBtn').onclick = vote;

// ===== ВХОД =====
function login() {
  username = document.getElementById('name').value.trim();
  if (!username) return alert('Введите ник');

  ws = new WebSocket(location.protocol==='https:'?`wss://${location.host}`:`ws://${location.host}`);

  ws.onopen = () => {
    if (confirm('Создать лобби?')) {
      ws.send(JSON.stringify({ type:'create_lobby', name:username }));
    } else {
      const id = prompt('Введите ID лобби');
      if (!id) return;
      lobbyId = id;
      ws.send(JSON.stringify({ type:'join_lobby', name:username, lobbyId }));
    }
  };

  ws.onmessage = handleMessage;

  loginDiv.style.display = 'none';
}

// ===== ОБРАБОТКА СООБЩЕНИЙ =====
function handleMessage(msg) {
  const data = JSON.parse(msg.data);
  switch(data.type) {
    case 'lobby_created':
      lobbyId = data.lobbyId;
      lobbyDiv.style.display='block';
      lobbyIdSpan.textContent = lobbyId;
      creatorSpan.textContent = username;
      updatePlayers(data.players);
      startBtn.style.display = 'inline-block';
      break;

    case 'lobby_update':
      lobbyDiv.style.display='block';
      updatePlayers(data.players);
      startBtn.style.display = data.players[0]===username?'inline-block':'none';
      break;

    case 'game_started':
      lobbyDiv.style.display='none';
      gameDiv.style.display='block';
      if(data.role==='spy'){
        roleText.textContent='😈 ТЫ ШПИОН';
        roleText.style.color='#ef4444';
      } else {
        roleText.textContent=`📄 Слово: ${data.word}`;
        roleText.style.color='#22c55e';
      }
      progressText.textContent='Проголосовали 0 из ...';
      resultText.textContent='';
      break;

    case 'vote_update':
      progressText.textContent=`Проголосовали ${data.voted} из ${data.total}`;
      break;

    case 'game_ended':
      resultText.textContent=`🏁 Игра окончена\nШпион: ${data.spy}\nВыбывший: ${data.eliminated}`;
      progressText.textContent='';
      break;

    case 'error':
      alert(data.message);
      break;
  }
}

// ===== ГОЛОС =====
function vote() {
  const target = prompt('Кого вы голосуете?');
  if(!target) return;
  ws.send(JSON.stringify({ type:'vote', target, lobbyId }));
}

// ===== СПИСОК ИГРОКОВ =====
function updatePlayers(players){
  playersList.innerHTML='';
  players.forEach(p=>{
    const li=document.createElement('li');
    li.textContent=p;
    playersList.appendChild(li);
  });
}

// ===== НАЧАТЬ ИГРУ =====
startBtn.onclick = () => {
  if(!lobbyId) return;
  ws.send(JSON.stringify({ type:'start_game', lobbyId, name:username }));
};
