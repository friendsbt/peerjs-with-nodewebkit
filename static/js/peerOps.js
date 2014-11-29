// DOM

var BLOCK_SIZE = 1024;
var BLOCK_IN_PART = 1024;
var e = new EventEmitter();

var PeerWrapper = {
  rangeInfo: {start: 0, end: 0, test: true},  // these two objects will be reused
  dataPeer2Peer: {content: null, index: 0},
  initPeer: function(my_uid) {  // must be called first in main.js
    this.peer = new Peer(my_uid, {host: '182.92.191.93', port: 9000, debug: 3});
    var that = this;
    this.uploadConnections = {};  // 保存用于上传的conn信息
    this.downloadConnections = {}; // 保存用于下载的conn信息
    this.peer.on('error', function(err){
      console.log(err);
    });
    this.peer.on('disconnected', function(){
      that.peer.reconnect();
    });
    this.peer.on('open', function(){
      console.log("connect to server");
    });
    this.peer.on('connection', function(conn) {
      // TODO: 确保上传端主动发起连接时不会引发这个事件
      console.log("Got connection from uploader: " + conn.peer);
      if (!that.downloadConnections[conn.label]) {
        that.downloadConnections[conn.label] = {};
      }
      conn.on('open', function() {
        that.downloadConnections[conn.label][conn.peer] = conn;
        conn.metadata.complete = true;
        conn.on('data', function(dataPeer2Peer) {
          if (dataPeer2Peer.test) {
            conn.metadata.count++;
          } else {
            window.socket.emit('receive', {data: dataPeer2Peer.content, index: dataPeer2Peer.index});
            console.log("got data", Date());
            if (dataPeer2Peer.rangeLastBlock) { // ready for next downloading next part
              conn.metadata.complete = true;
              e.emitEvent('part-complete-' + conn.label, conn.peer);
            }
          }
        });
        conn.on('error', function(err) {
          console.log(err);
        });
        conn.on('close', function() {
          console.log('uploader' + conn.peer + ' has closed data connection');
          delete that.downloadConnections[conn.label][conn.peer];
        });
      });
    });
  },
  download: function(hash, totalparts) {
    var that = this;
    var conn;
    var parts_left = [];
    for (var i = 0; i < totalparts; i++) {
      parts_left.push(i);
    }
    // TODO: what if parts_left.length == 0
    // TODO: when to remove this listener
    e.addListener('part-compelte-' + hash, function(uploader){
      if (parts_left.length > 0) {
        conn = that.downloadConnections[hash][uploader];
        conn.metadata.complete = false;
        that.rangeInfo.start = BLOCK_IN_PART * parts_left.shift();
        that.rangeInfo.end = that.rangeInfo.start + BLOCK_IN_PART;
        conn.metadata.downloadingPartIndex = that.rangeInfo.start;
        that.rangeInfo.test = false;
        conn.send(that.rangeInfo);
      }
    });
    setTimeout(function(){
      // 下载端发送可靠性测试rangeInfo
      // TODO: set refuse more connection field
      for (var uploader_uid in that.downloadConnections[hash]) {
        if (that.downloadConnections[hash].hasOwnProperty(uploader_uid)) {
          that.rangeInfo.start = 0;
          that.rangeInfo.end = 10;
          that.rangeInfo.test = true;
          that.downloadConnections[hash][uploader_uid].send(that.rangeInfo);
        }
      }
      setTimeout(function() { // 等待1s, 确定可靠连接, 分配初始下载任务
        var unreliableUploaders = [];
        for (var uploader_uid in that.downloadConnections[hash]) {
          if (that.downloadConnections[hash].hasOwnProperty(uploader_uid)) {
            conn = that.downloadConnections[hash][uploader_uid];
            if (conn.metadata.count === 10) {
              console.log("reliable uploader: ", conn.peer);
              if (parts_left.length > 0) {
                conn.metadata.complete = false;   // set status
                that.rangeInfo.start = BLOCK_IN_PART * parts_left.shift();
                that.rangeInfo.end = that.rangeInfo.start + BLOCK_IN_PART;
                conn.metadata.downloadingPartIndex = that.rangeInfo.start;
                that.rangeInfo.test = false;  // real data package, not testing package
                conn.send(that.rangeInfo);
              }
            } else {
              unreliableUploaders.push(uploader_uid);
              conn.close(); // notify uploader
            }
          }
        }
        unreliableUploaders.forEach(function(unreliableUploader){
          delete that.downloadConnections[hash][unreliableUploader];
        });
      }, 1000);
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
      // TODO: uploader 多次尝试连接
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
          var lastBlockSize = BLOCK_SIZE;
          if (rangeInfo.end >= fileInfo.totalFullBlocks) {
            // end 永远是1024倍数, 有可能大于totalFullBlocks, 此时需要替换成真实值
            rangeInfo.end = fileInfo.totalFullBlocks;
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
        console.log('downloader' + conn.peer + ' has closed data connection');
        delete that.uploadConnections[fileInfo.hash][conn.peer];
      });
    } else {
      throw PeerDisconnectedServerError("peer no longer connected to peerServer");
    }
  },
  sendBlock: function(dataNode2DOM){
    this.dataPeer2Peer.content = dataNode2DOM.content;
    this.dataPeer2Peer.index = dataNode2DOM.index;
    // set or remove test/rangeLastBlock attribute
    if (dataNode2DOM.test) {
      this.dataPeer2Peer.test = true;
    } else if (this.dataPeer2Peer.test) {
      delete this.dataPeer2Peer.test;
    }
    if (dataNode2DOM.rangeLastBlock) {
      this.dataPeer2Peer.rangeLastBlock = true;
      console.log('last block of this part ', Date());
    } else if (this.dataPeer2Peer.rangeLastBlock) {
      delete this.dataPeer2Peer.rangeLastBlock;
    }
    PeerWrapper.uploadConnections[dataNode2DOM.hash][dataNode2DOM.downloader]
      .send(this.dataPeer2Peer);
    console.log("buffersize: ",
      PeerWrapper.uploadConnections[dataNode2DOM.hash][dataNode2DOM.downloader].bufferSize);
    console.log('block ', dataNode2DOM.index, "sent: ", Date());
  }
};
