// DOM

var uploadConnections = {};  // 保存用于上传的conn信息
var downloadConnections = {}; // 保存用于下载的conn信息
var BLOCK_SIZE = 1024;

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

function upload(my_uid, downloader_uid, fileInfo) {
    var peer = new Peer(my_uid, {host: '182.92.191.93', port: 9000, debug: 3});
    peer.on('error', function(err){console.log(err)});
    peer.on('disconnected', function(){
        peer.reconnect();
    });
    peer.on('open', function(){
      console.log('connect to server');
      var conn = peer.connect(downloader_uid, { reliable: true });
      if (!uploadConnections[downloader_uid]) {
        uploadConnections[downloader_uid] = {};
      }
      uploadConnections[downloader_uid][fileInfo.hash] = conn;
      conn.on('open', function(){
          console.log("connect to peer " + conn.peer);
      });
      conn.on('data', function(data){
          /*
          uploader唯一可能接受downloader的信息就是上传的数据块范围信息
           */
          console.log('got data: ', data);
          if (typeof(data.start)==='undefined' || typeof(data.end)==='undefined') {
              console.log('block range format wrong!');
              conn.close();
          } else {
              console.log('start: ' + data.start);
              console.log('end: ' + data.end);
              var lastBlockSize = BLOCK_SIZE;
              if (data.end === fileInfo.totalFullBlocks) {
                  lastBlockSize = fileInfo.lastBlockSize;
              }
              window.socket.emit('send_data_blocks', {
                path: fileInfo.path,
                start: data.start, count: data.end-data.start,
                lastBlockSize: lastBlockSize
              });
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
