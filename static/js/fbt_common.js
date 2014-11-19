// DOM

window.socket = io.connect('http://localhost/', { port: 12345 });

window.socket.on('connect', function(){
    window.socket.on('send', function(data){
        connections[DOWNLOADER][0].send(data.data);
        console.log('is reliable:', connections[DOWNLOADER][0].reliable);
        console.log("buffersize:", connections[DOWNLOADER][0].bufferSize);
        console.log('block ', data.index, "sent: ", Date());
    });

    window.socket.on('control', function(message){
        switch(message.type) {
            case "disconnect":
                connections[DOWNLOADER][0].close();
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
});
