/*
FBT中的连接发起模式:
使用PeerJs时, 应该由上传端发起连接, 下载端记录一个时间段内收到的连接
根据连接的数量来安排下载任务, 给每个上传端发送一个{start: index1, end: index2}
这样上传端就知道自己应该发送哪一部分的数据
 */
// TODO: retry connection
var mode = 'send';
//var mode = 'receive';
window.socket = io.connect('http://localhost/', { port: 12345 });

var UPLOADER = 'zuoyao';
var DOWNLOADER = 'lizhihua';

var connections = {};

if (mode === 'send') {
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

if (mode === 'receive') {
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
        // TODO: 下载端也应该记录connection
        conn.on('open', function(){
            console.log("connect to peer " + conn.peer);
            setTimeout(function(){  // this timeout is necessary
                conn.send({start: 0, end: 1000});   // TODO: downloader should know real start&&end
            }, 2000);
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
    });
}

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
