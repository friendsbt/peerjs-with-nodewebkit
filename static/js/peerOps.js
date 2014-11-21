// DOM

var BLOCK_SIZE = 1024;

var PeerWrapper = {
  initPeer: function(my_uid) {  // must be called first in main.js
    this.peer = new Peer(my_uid, {host: '182.92.191.93', port: 9000, debug: 3});
    var that = this;
    this.uploadConnections = {};  // 保存用于上传的conn信息
    this.downloadConnections = {}; // 保存用于下载的conn信息
    this.peer.on('error', function(err){console.log(err)});
    this.peer.on('disconnected', function(){
      that.peer.reconnect();
    });
    this.peer.on('open', function(){
      console.log("connect to server");
    });
    this.peer.on('connection', function(conn) {
      console.log("Got connection from uploader: " + conn.peer);
      if (!that.downloadConnections[conn.peer]) {
        that.downloadConnections[conn.peer] = {};
      }
      that.downloadConnections[conn.peer][conn.label] = conn; // peer:id, label:hash
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
    });
  },
  download: function() {
    var that = this;
    // TODO: what to do here?
  },
  upload: function(my_uid, downloader_uid, fileInfo){
    var that = this;
    if (!this.peer.disconnected) {  // check peer's connection to PeerServer
      var conn = this.peer.connect(downloader_uid, {
        reliable: true,
        label: fileInfo.hash.toString()  // identify this data connection
      });
      if (!that.uploadConnections[downloader_uid]) {
        that.uploadConnections[downloader_uid] = {};
      }
      that.uploadConnections[downloader_uid][fileInfo.hash] = conn;
      conn.on('open', function(){
        console.log("connect to downloader: " + conn.peer);
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
    } else {
      throw PeerDisconnectedServerError("peer no longer connected to peerServer");
    }
  }
};
