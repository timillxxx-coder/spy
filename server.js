const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const lobbies = {};

const wordsByTheme = {
    travel: ["Самолет","Отель","Пляж","Горы","Багаж"],
    games: ["Марио","Покемон","Шахматы","Майнкрафт","Фортнайт"],
    programming: ["JavaScript","Python","HTML","CSS","Node.js"]
};

function generateLobbyId(){ return Math.random().toString(36).substring(2,8).toUpperCase(); }

function broadcastLobbyUpdate(lobbyId){
    const lobby = lobbies[lobbyId];
    if(!lobby) return;
    const data={ type:'lobby_update', players:lobby.players.map(p=>p.name), host:lobby.host, lobbyId };
    lobby.players.forEach(p=>p.ws.send(JSON.stringify(data)));
}

function broadcastVoteProgress(lobby){
    lobby.players.forEach(p=>p.ws.send(JSON.stringify({ type:'vote_update', voted:lobby.votedCount, total:lobby.players.length })));
}

wss.on('connection', ws=>{
    let currentLobby = null;
    let playerName = null;

    ws.on('message', msg=>{
        const data=JSON.parse(msg);

        if(data.type==='create_lobby'){
            const lobbyId = generateLobbyId();
            lobbies[lobbyId]={ host:data.name, players:[{name:data.name, ws}], started:false, spy:null, theme:'travel' };
            currentLobby = lobbyId;
            playerName = data.name;
            ws.send(JSON.stringify({ type:'lobby_created', lobbyId }));
            broadcastLobbyUpdate(lobbyId);
        }

        if(data.type==='join_lobby'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby){ ws.send(JSON.stringify({type:'error', message:'Лобби не найдено'})); return; }
            lobby.players.push({name:data.name, ws});
            currentLobby = data.lobbyId;
            playerName = data.name;
            ws.send(JSON.stringify({ type:'joined_lobby', lobbyId:data.lobbyId, host:lobby.host, players:lobby.players.map(p=>p.name) }));
            broadcastLobbyUpdate(data.lobbyId);
        }

        if(data.type==='set_theme'){
            const lobby = lobbies[data.lobbyId];
            if(lobby && data.theme) lobby.theme = data.theme;
        }

        if(data.type==='start_game' || data.type==='restart_game'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby) return;

            const themeWords = wordsByTheme[lobby.theme] || wordsByTheme['travel'];
            const spyIndex = Math.floor(Math.random()*lobby.players.length);

            lobby.players.forEach((p,i)=>{
                p.role = i===spyIndex ? 'spy' : 'word';
                p.word = p.role==='word' ? themeWords[Math.floor(Math.random()*themeWords.length)] : null;
                p.voted = false;
            });

            lobby.votedCount = 0;
            lobby.started = true;

            lobby.players.forEach(p=>{
                p.ws.send(JSON.stringify({
                    type:'game_started',
                    role:p.role,
                    word:p.word,
                    players:lobby.players.map(x=>x.name),
                    totalPlayers:lobby.players.length
                }));
            });
        }

        if(data.type==='vote'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby) return;
            const voter = lobby.players.find(p=>p.name===data.name);
            if(!voter || voter.voted) return;
            voter.voted=true;
            voter.voteTarget=data.target;
            lobby.votedCount++;
            broadcastVoteProgress(lobby);

            if(lobby.votedCount === lobby.players.length){
                const votes={};
                lobby.players.forEach(p=>{ if(p.voteTarget) votes[p.voteTarget]=(votes[p.voteTarget]||0)+1; });
                const eliminated = Object.entries(votes).sort((a,b)=>b[1]-a[1])[0][0];
                const spy = lobby.players.find(p=>p.role==='spy').name;
                lobby.players.forEach(p=>p.ws.send(JSON.stringify({ type:'game_ended', eliminated, spy })));
            }
        }
    });
});

server.listen(process.env.PORT || 8080, ()=>console.log('Server started'));
