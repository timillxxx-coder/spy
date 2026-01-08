const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();

// Статика
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const WORDS = ['бумага','стол','машина','телефон','окно'];
let lobbies = {};

// ===== ВСПОМОГАТЕЛЬНЫЕ =====
function send(ws, type, data = {}) { ws.send(JSON.stringify({ type, ...data })); }
function broadcast(lobbyId, type, data = {}) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;
  lobby.players.forEach(p => send(p.ws, type, data));
}
function generateLobbyId() { return Math.floor(100000 + Math.random()*900000).toString(); }

// ===== WEBSOCKET =====
wss.on('connection', ws => {
  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    const { type } = data;

    // СОЗДАНИЕ ЛОББИ
    if (type === 'create_lobby') {
      const lobbyId = generateLobbyId();
      lobbies[lobbyId] = {
        host: ws,
        players: [{ ws, name: data.name, role:null, vote:null }],
        started: false,
        word:null,
        spyIndex:null
      };
      ws.lobbyId = lobbyId;
      send(ws,'lobby_created',{ lobbyId, players:[data.name], host:true });
    }

    // ВХОД В ЛОББИ
    if (type === 'join_lobby') {
      const lobby = lobbies[data.lobbyId];
      if (!lobby || lobby.started) { send(ws,'error',{message:'Лобби не найдено или игра началась'}); return; }
      lobby.players.push({ ws, name:data.name, role:null, vote:null });
      ws.lobbyId = data.lobbyId;
      broadcast(data.lobbyId,'lobby_update',{ players:lobby.players.map(p=>p.name) });
    }

    // СТАРТ ИГРЫ
    if (type === 'start_game') {
      const lobby = lobbies[ws.lobbyId];
      if (!lobby || lobby.host!==ws) return;
      lobby.started = true;
      lobby.word = WORDS[Math.floor(Math.random()*WORDS.length)];
      lobby.spyIndex = Math.floor(Math.random()*lobby.players.length);
      lobby.players.forEach((p,i)=>{
        p.role = i===lobby.spyIndex?'spy':'civil';
        p.vote = null;
        send(p.ws,'game_started',{
          role: p.role,
          word: p.role==='spy'?null:lobby.word
        });
      });
    }

    // ГОЛОСОВАНИЕ
    if (type==='vote') {
      const lobby = lobbies[ws.lobbyId];
      if (!lobby || !lobby.started) return;
      const voter = lobby.players.find(p=>p.ws===ws);
      if (!voter || voter.vote!==null) return;
      voter.vote = data.target;
      const votesCount = lobby.players.filter(p=>p.vote!==null).length;
      broadcast(ws.lobbyId,'vote_update',{ voted:votesCount, total:lobby.players.length });

      if (votesCount===lobby.players.length) {
        let votes={};
        lobby.players.forEach(p=>{ votes[p.vote]=(votes[p.vote]||0)+1; });
        let eliminated = Object.keys(votes).reduce((a,b)=>votes[a]>votes[b]?a:b);
        broadcast(ws.lobbyId,'game_ended',{ eliminated, spy:lobby.players[lobby.spyIndex].name });
        delete lobbies[ws.lobbyId];
      }
    }

  });

  ws.on('close',()=>{
    const lobbyId = ws.lobbyId;
    if (!lobbyId || !lobbies[lobbyId]) return;
    const lobby = lobbies[lobbyId];
    lobby.players = lobby.players.filter(p=>p.ws!==ws);
    if(lobby.players.length===0) delete lobbies[lobbyId];
    else broadcast(lobbyId,'lobby_update',{ players:lobby.players.map(p=>p.name) });
  });
});

// ===== ПОРТ =====
const PORT = process.env.PORT || 8080;
server.listen(PORT,()=>console.log('Server running on port',PORT));
