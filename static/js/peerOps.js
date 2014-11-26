// DOM

var BLOCK_SIZE = 1024;

var PeerWrapper = {
  rangeInfo: {start: 0, end: 0, test: true},  // these two objects will be reused
  dataPeer2Peer: {content: null, index: 0},
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
      if (!that.downloadConnections[conn.label]) {
        that.downloadConnections[conn.label] = {};
      }
      conn.on('open', function() {
        that.downloadConnections[conn.label][conn.peer] = conn;
        // TODO: range info for each connection should be determined in download func
        conn.on('data', function(dataPeer2Peer) {
          if (dataPeer2Peer.test) {
            conn.metadata.count++;
          } else {
            window.socket.emit('receive', {data: dataPeer2Peer.content, start: dataPeer2Peer.index});
            start++;
            console.log("got data", Date());
          }
        });
        conn.on('error', function(err) {
          console.log(err);
        });
        conn.on('close', function() {
          console.log(conn.peer + 'has closed data connection');
        });
      });
    });
  },
  download: function(hash) {
    var that = this;
    setTimeout(function(){
      // 下载端发送可靠性测试rangeInfo
      for (var uploader_uid in that.downloadConnections[hash]) {
        if (that.downloadConnections[hash].hasOwnProperty(uploader_uid)) {
          that.rangeInfo.start = 0;
          that.rangeInfo.end = 10;
          that.rangeInfo.test = true;
          that.downloadConnections[hash][uploader_uid].send(that.rangeInfo);
        }
      }
      setTimeout(function() {
        var unreliableUploaders = [];
        for (var uploader_uid in that.downloadConnections[hash]) {
          if (that.downloadConnections[hash].hasOwnProperty(uploader_uid)) {
            if (that.downloadConnections[hash][uploader_uid].metadata.count === 10) {
              // TODO: 可靠连接, 可以进行下一步工作, 例如删除不可靠连接
            } else {
              unreliableUploaders.push(uploader_uid);
              that.downloadConnections[hash][uploader_uid].close(); // notify uploader
            }
          }
        }
        unreliableUploaders.forEach(function(unreliableUploader){
          delete that.downloadConnections[hash][unreliableUploader];
        });
      }, 1000);
      // set refuse more connection field
    }, 5000);
  },
  upload: function(my_uid, downloader_uid, fileInfo){
    var that = this;
    if (!this.peer.disconnected) {  // check peer's connection to PeerServer
      var conn = this.peer.connect(downloader_uid, {
        reliable: true,
        label: fileInfo.hash.toString(),  // data connection ID
        metadata: {count: 0}              // for reliablity test
      });
      if (!that.uploadConnections[fileInfo.hash]) {
        that.uploadConnections[fileInfo.hash] = {};
      }
      that.uploadConnections[fileInfo.hash][downloader_uid] = conn;
      conn.on('open', function(){
        console.log("connect to downloader: " + conn.peer);
      });
      conn.on('data', function(rangeInfo){
        console.log('got data: ', rangeInfo);
        if (typeof(rangeInfo.start)==='undefined' || typeof(rangeInfo.end)==='undefined') {
          console.log('block range format wrong!');
          conn.close();
        } else {
          console.log('start: ' + rangeInfo.start);
          console.log('end: ' + rangeInfo.end);
          var lastBlockSize = BLOCK_SIZE;
          if (rangeInfo.end === fileInfo.totalFullBlocks) {
            // end 是文件真正的最后一块
            lastBlockSize = fileInfo.realLastBlockSize;
          }
          window.socket.emit('send_data_blocks', {
            path: fileInfo.path,
            start: rangeInfo.start,
            end: rangeInfo.end,
            lastBlockSize: lastBlockSize,
            downloader: conn.peer,
            hash: conn.label,
            test: rangeInfo.test
          });
        }
      });
      conn.on('error', function(err){
        console.log(err);
      });
      conn.on('close', function(){
        console.log(conn.peer + ' has closed data connection');
        delete that.uploadConnections[fileInfo][conn.peer];
      });
    } else {
      throw PeerDisconnectedServerError("peer no longer connected to peerServer");
    }
  },
  sendBlock: function(dataNode2DOM){
    this.dataPeer2Peer.content = dataNode2DOM.content;
    this.dataPeer2Peer.index = dataNode2DOM.index;
    if (dataNode2DOM.test) {
      this.dataPeer2Peer.test = true;
    } else if (this.dataPeer2Peer.test) {
      delete this.dataPeer2Peer.test;
    }
    PeerWrapper.uploadConnections[dataNode2DOM.hash][dataNode2DOM.downloader]
      .send(this.dataPeer2Peer);
    console.log("buffersize:",
      PeerWrapper.uploadConnections[dataNode2DOM.hash][dataNode2DOM.downloader].bufferSize);
    console.log('block ', dataNode2DOM.index, "sent: ", Date());
  }
};
