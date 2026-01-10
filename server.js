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
    travel:["Abaddon","Alchemist","Ancient Apparition","Anti-Mage","Arc Warden","Axe","Bane","Batrider","Beastmaster","Bloodseeker","Bounty Hunter","Brewmaster","Bristleback","Broodmother","Centaur Warrunner","Chaos Knight","Chen","Clinkz","Clockwerk","Crystal Maiden","Dark Seer","Dark Willow","Dawnbreaker","Dazzle","Death Prophet","Disruptor","Doom","Dragon Knight","Drow Ranger","Earth Spirit","Earthshaker","Elder Titan","Ember Spirit","Enchantress","Enigma","Faceless Void","Grimstroke","Gyrocopter","Hoodwink","Huskar","Invoker","Io","Jakiro","Juggernaut","Keeper of the Light","Kez","Kunkka","Legion Commander","Leshrac","Lich","Lifestealer","Lina","Lion","Lone Druid","Luna","Lycan","Magnus","Marci","Mars","Medusa","Meepo","Mirana","Monkey King","Morphling","Muerta","Naga Siren","Nature’s Prophet","Necrophos","Night Stalker","Nyx Assassin","Ogre Magi","Omniknight","Oracle","Outworld Destroyer","Pangolier","Phantom Assassin","Phantom Lancer","Phoenix","Primal Beast","Puck","Pudge","Pugna","Queen of Pain","Razor","Riki","Rubick","Sand King","Shadow Demon","Shadow Fiend","Shadow Shaman","Silencer","Skywrath Mage","Slardar","Slark","Snapfire","Sniper","Spectre","Spirit Breaker","Storm Spirit","Sven","Techies","Templar Assassin","Terrorblade","Tidehunter","Timbersaw","Tinker","Tiny","Treant Protector","Troll Warlord","Tusk","Underlord","Undying","Ursa","Vengeful Spirit","Venomancer","Viper","Visage","Void Spirit","Warlock","Weaver","Windranger","Winter Wyvern","Witch Doctor","Wraith King","Zeus"],
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
            const chosenWord = themeWords[Math.floor(Math.random()*themeWords.length)];

            lobby.players.forEach((p,i)=>{
                if(i === spyIndex){
                    p.role='spy';
                    p.word=null;
                } else {
                    p.role='word';
                    p.word=chosenWord;
                }
                p.voted=false;
                p.voteTarget=null;
            });

            lobby.votedCount=0;
            lobby.started=true;

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
