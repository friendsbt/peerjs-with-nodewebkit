var mode = 'send';
//var mode = 'receive';
window.socket = io.connect('http://localhost/', { port: 12345 });

if (mode === 'send') {
    window.socket.on('connect', function(){
        socket.on('send', function(data){  // what is this "socket"? is it window.socket?
            conn.send(data.data);
            console.log('is reliable:', conn.reliable);
            console.log("buffersize:", conn.bufferSize);
            console.log('block ', data.index, "sent: ", Date());
        });
    });
    var peer = new Peer('zuoyao', {host: '182.92.191.93', port: 9000, debug: 3});
    peer.on('error', function(err){console.log(err)});
    peer.on('disconnected', function(){
        peer.reconnect();
    });
    var conn = peer.connect(
        'lizhihua',
        {
            reliable: true
        }
    );
    conn.on('open', function(){
        console.log("connect to peer");
        window.socket.emit('send');
    });
    conn.on('error', function(err){console.log(err)});
    conn.on('close', function(){
        console.log(conn.peer + 'has closed data connection');
    });
}

if (mode === 'receive') {
    var start = 0;
    var peer = new Peer('lizhihua', {host: '182.92.191.93', port: 9000, debug: 3});
    peer.on('connection', function(conn) {
        console.log("start writing to file");
        console.log('is reliable:', conn.reliable);
        conn.on('data', function(data){
            window.socket.emit('receive', {data: data, start: start});
            start++;
            console.log("got data", Date());
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
