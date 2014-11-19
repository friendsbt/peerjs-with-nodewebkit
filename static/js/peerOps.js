// DOM
exports.peerjsDownloader = function(){};

var connections = {};

function download() {
    var start = 0;
    var peer = new Peer(DOWNLOADER, {host: '182.92.191.93', port: 9000, debug: 3});
    peer.on('error', function(err){console.log(err)});
    peer.on('disconnected', function(){
        peer.reconnect();
    });
    peer.on('open', function(){
        console.log("connect to server");
    });
    peer.on('connection', function(conn) {
        console.log("Got connection from " + conn.peer);
        connections[UPLOADER] = [];
        connections[UPLOADER].push(conn);
        addConnEventListener(conn);
    });
    function addConnEventListener(conn) {
        // TODO: 下载端也应该记录connection
        conn.on('open', function() {
            console.log("data connection open");
            setTimeout(function () {  // this timeout is necessary
                conn.send({start: 0, end: 1000});   // TODO: downloader should know real start&&end
            }, 2000);
            conn.on('data', function (data) {
                window.socket.emit('receive', {data: data, start: start});
                start++;
                console.log("got data", Date());
            });
            conn.on('error', function (err) {
                console.log(err);
            });
            conn.on('close', function () {
                console.log(conn.peer + 'has closed data connection');
            });
        });
    }
}

function upload() {
    var peer = new Peer(UPLOADER, {host: '182.92.191.93', port: 9000, debug: 3});
    peer.on('error', function(err){console.log(err)});
    peer.on('disconnected', function(){
        peer.reconnect();
    });
    peer.on('open', function(){
        console.log('connect to server');
        var conn = peer.connect(DOWNLOADER, { reliable: true});
        connections[DOWNLOADER] = [];
        connections[DOWNLOADER].push(conn);
        conn.on('open', function(){
            console.log("connect to peer " + conn.peer);
        });
        conn.on('data', function(data){
            console.log('got data: ', data);
            if (typeof(data.start)==='undefined' || typeof(data.end)==='undefined') {
                console.log('block range format wrong!');
                conn.close();
            } else {
                // TODO: use start and end to select data range to send
                console.log('start: ' + data.start);
                console.log('end: ' + data.end);
                window.socket.emit('send');
            }
        });
        conn.on('error', function(err){
            console.log(err);
        });
        conn.on('close', function(){
            console.log(conn.peer + ' has closed data connection');
        });
    });
}
