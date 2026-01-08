const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const lobbies = {}; 

function generateLobbyId() {
    return Math.random().toString(36).substring(2,8).toUpperCase();
}

function broadcastLobbyUpdate(lobbyId){
    const lobby = lobbies[lobbyId];
    if(!lobby) return;
    const data = {
        type: 'lobby_update',
        players: lobby.players.map(p=>p.name),
        host: lobby.host,
        lobbyId
    };
    lobby.players.forEach(p=>p.ws.send(JSON.stringify(data)));
}

function broadcastVoteProgress(lobby){
    lobby.players.forEach(p=>{
        p.ws.send(JSON.stringify({ type:'vote_update', voted: lobby.votedCount, total: lobby.players.length }));
    });
}

wss.on('connection', ws=>{
    let currentLobby = null;
    let playerName = null;

    ws.on('message', msg=>{
        const data = JSON.parse(msg);

        if(data.type==='create_lobby'){
            const lobbyId = generateLobbyId();
            lobbies[lobbyId] = { host: data.name, players:[{name:data.name, ws}], started:false, spy:null };
            currentLobby = lobbyId;
            playerName = data.name;

            ws.send(JSON.stringify({ type:'lobby_created', lobbyId }));
            broadcastLobbyUpdate(lobbyId);
        }

        if(data.type==='join_lobby'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby){ ws.send(JSON.stringify({type:'error', message:'Лобби не найдено'})); return; }
            if(lobby.started){ ws.send(JSON.stringify({type:'error', message:'Игра уже началась'})); return; }

            lobby.players.push({name:data.name, ws});
            currentLobby = data.lobbyId;
            playerName = data.name;

            ws.send(JSON.stringify({ type:'joined_lobby', lobbyId:data.lobbyId, host:lobby.host }));
            broadcastLobbyUpdate(currentLobby);
        }

        if(data.type==='start_game'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby || lobby.host !== data.name) return;
            lobby.started = true;

            const words = ['Бумага','Карандаш','Компьютер','Мяч','Книга'];
            const word = words[Math.floor(Math.random()*words.length)];
            const spyIndex = Math.floor(Math.random()*lobby.players.length);
            lobby.spy = lobby.players[spyIndex].name;

            lobby.players.forEach((p,i)=>{
                const role = i===spyIndex?'spy':'word';
                p.role = role;
                p.ws.send(JSON.stringify({
                    type:'game_started',
                    role,
                    word: role==='word'?word:null,
                    totalPlayers: lobby.players.length,
                    players: lobby.players.map(pl=>pl.name)
                }));
            });

            lobby.votes = {};
            lobby.votedCount = 0;
        }

        if(data.type==='vote'){
            const lobby = lobbies[data.lobbyId];
            if(!lobby) return;
            if(!lobby.votes[data.name]){
                lobby.votes[data.name] = data.target;
                lobby.votedCount++;
            }

            broadcastVoteProgress(lobby);

            if(lobby.votedCount>=lobby.players.length){
                const voteCounts = {};
                Object.values(lobby.votes).forEach(t=>voteCounts[t]=(voteCounts[t]||0)+1);
                let max=0, eliminated=null;
                for(const [p,count] of Object.entries(voteCounts)){
                    if(count>max){ max=count; eliminated=p; }
                }
                lobby.players.forEach(p=>{
                    p.ws.send(JSON.stringify({ type:'game_ended', spy:lobby.spy, eliminated }));
                });
            }
        }
    });

    ws.on('close', ()=>{
        if(currentLobby && lobbies[currentLobby]){
            const lobby = lobbies[currentLobby];
            lobby.players = lobby.players.filter(p=>p.ws!==ws);
            if(lobby.players.length===0){ delete lobbies[currentLobby]; }
            else{
                if(lobby.host===playerName){ lobby.host=lobby.players[0].name; }
                broadcastLobbyUpdate(currentLobby);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
