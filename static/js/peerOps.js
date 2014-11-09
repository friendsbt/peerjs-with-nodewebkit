var mode = 'send';
//var mode = 'receive';
window.socket = io.connect('http://localhost/', { port: 12345 });

var UPLOADER = 'zuoyao';
var DOWNLOADER = 'lizhihua';
// TODO: DOWNLOADER raise new connection rather than UPLOADER

if (mode === 'send') {
    var connections = {};
    window.socket.on('connect', function(){
        socket.on('send', function(data){  // what is this "socket"? is it window.socket?
            connections[DOWNLOADER][0].send(data.data);
            console.log('is reliable:', connections[DOWNLOADER][0].reliable);
            console.log("buffersize:", connections[DOWNLOADER][0].bufferSize);
            console.log('block ', data.index, "sent: ", Date());
        });
    });
    var peer = new Peer(UPLOADER, {host: '182.92.191.93', port: 9000, debug: 3});
    peer.on('error', function(err){console.log(err)});
    peer.on('disconnected', function(){
        peer.reconnect();
    });
    peer.on('open', function(){
        console.log('open');
        var conn = peer.connect(DOWNLOADER, { reliable: true });
        connections[DOWNLOADER] = [];
        connections[DOWNLOADER].push(conn);
        conn.on('open', function(){
            console.log("connect to peer " + conn.peer);
            window.socket.emit('send');
        });
        conn.on('error', function(err){
            console.log(err);
        });
        conn.on('close', function(){
            console.log(conn.peer + ' has closed data connection');
        });
    });
}

if (mode === 'receive') {
    var start = 0;
    var peer = new Peer(DOWNLOADER, {host: '182.92.191.93', port: 9000, debug: 3});
    peer.on('error', function(err){console.log(err)});
    peer.on('disconnected', function(){
        peer.reconnect();
    });
    peer.on('connection', function(conn) {
        console.log("connect to peer" + conn.peer);
        conn.on('data', function(data){
            window.socket.emit('receive', {data: data, start: start});
            start++;
            console.log("got data", Date());
        });
        conn.on('error', function(err){
            console.log(err);
        });
        conn.on('close', function(){
            console.log(conn.peer + 'has closed data connection');
        });
    });
}

window.socket.on('control', function(message){
    switch(message.type) {
        case "disconnect":
            peer.disconnect();
            break;
        case "result":
            console.log(message.result);
            peer.disconnect();
            break;
        default:
            console.log("wrong ctrl msg: ", message);
    }
});
