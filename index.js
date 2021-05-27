require('dotenv').config()
const path = require("path")
const express = require('express')
const http = require('http')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')

const app = express()
const server = http.Server(app)
const io = require('socket.io')(server)

const port = process.env.PORT
const host = process.env.HOST

app.use('/videocall/', express.static(path.join(__dirname, "public")))
app.use(cookieParser())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

var useronline = []
const channels = {}
const sockets = {}

io.on('connection', socket => {
  console.log(socket.id + ': connected');
  socket.channels = {};
  sockets[socket.id] = socket;
  socket.on("connectto", (data) => {
    var { userid, username } = data;
    socket.join(data.userid);
    var isconnect = false
    useronline.forEach(element => {
      if (element.userid === data.userid) {
        console.log('da connect');
        isconnect = true;
      }
    });
    if (!isconnect) {
      useronline.push({ userid: userid, username: username, socketid: socket.id })
      console.log(`userid is ${data.userid} connected`)
    }
  })

  socket.on("useronline", () => {
    io.emit("useronline", useronline)
  })

  socket.on('message', (data) => {
    console.log(data.receiver)
    io.to(data.receiver[0]._id).to(data.receiver[1]._id).emit('message', data)
  })

  socket.on('call', data => {
    console.log(data.receiver);
    io.to(data.receiver).emit('call', data);
  })

  socket.on('join', (config) => {
    const channel = config.channel;

    if (channel in socket.channels) {
      return;
    }

    if (!(channel in channels)) {
      channels[channel] = {};
    }

    for (id in channels[channel]) {
      channels[channel][id].emit('addPeer', { 'peer_id': socket.id, 'should_create_offer': false });
      socket.emit('addPeer', { 'peer_id': id, 'should_create_offer': true });
    }

    channels[channel][socket.id] = socket;
    socket.channels[channel] = channel;
  });

  const part = (channel) => {

    if (!(channel in socket.channels)) {
      return;
    }

    delete socket.channels[channel];
    delete channels[channel][socket.id];

    for (id in channels[channel]) {
      channels[channel][id].emit('removePeer', { 'peer_id': socket.id });
      socket.emit('removePeer', { 'peer_id': id });
    }
  }

  socket.on('part', part);

  socket.on('relayICECandidate', (config) => {
    let peer_id = config.peer_id;
    let ice_candidate = config.ice_candidate;

    if (peer_id in sockets) {
      sockets[peer_id].emit('iceCandidate', { 'peer_id': socket.id, 'ice_candidate': ice_candidate });
    }
  });

  socket.on('relaySessionDescription', (config) => {
    let peer_id = config.peer_id;
    let session_description = config.session_description;

    if (peer_id in sockets) {
      sockets[peer_id].emit('sessionDescription', {
        'peer_id': socket.id,
        'session_description': session_description
      });
    }
  });

  socket.on("disconnect", () => {
    for (const channel in socket.channels) {
      part(channel);
    }

    delete sockets[socket.id];

    for (let index = 0; index < useronline.length; index++) {
      if (useronline) {

        if ((useronline[index].socketid === socket.id)) {
          useronline.splice(index, 1)
          break;
        }
      }
    }

    console.log("Client disconnected");
  })
})

app.all(['/videocall', '/videocall/:room'], (req, res) => res.sendFile(__dirname + '/call.html'))

server.listen(port, () => {
  console.log(`>> Server running at ${host}:${port}`);
})