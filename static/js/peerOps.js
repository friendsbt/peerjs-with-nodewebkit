// DOM

var BLOCK_SIZE = 1024;
var BLOCK_IN_PART = 1024;
var MAX_TRY = 3;
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
        console.log("connected to downloader: " + conn.peer);
        that.downloadConnections[conn.label][conn.peer] = conn;
        conn.metadata.complete = true;
        conn.on('data', function(dataPeer2Peer) {
          if (dataPeer2Peer.test) {
            console.log("got test package from ", conn.peer);
            conn.metadata.count++;
            console.log("type of content: ", typeof(dataPeer2Peer.content));
            console.log("data length: ", dataPeer2Peer.content.byteLength);
          } else {
            window.socket.emit('receive', {
              hash: conn.label,
              data: dataPeer2Peer.content,
              index: dataPeer2Peer.index
            });
            console.log("got data", Date());
            if (dataPeer2Peer.rangeLastBlock) { // ready for next downloading next part
              conn.metadata.complete = true;
              e.emitEvent('part-complete-' + conn.label, conn.peer);
              console.log("part complete: ", conn.metadata.downloadingPartIndex);
            }
          }
        });
        conn.on('error', function(err) {
          console.log(err);
        });
        conn.on('close', function() {
          console.log('uploader ' + conn.peer + ' has closed data connection');
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
        that.rangeInfo.end = that.rangeInfo.start + BLOCK_IN_PART - 1;
        conn.metadata.downloadingPartIndex = that.rangeInfo.start;
        that.rangeInfo.test = false;
        conn.send(that.rangeInfo);
        console.log("download part ", that.rangeInfo.start, "from", conn.peer);
      }
    });
    setTimeout(function(){
      // 下载端发送可靠性测试rangeInfo
      // TODO: set refuse more connection field
      for (var uploader_uid in that.downloadConnections[hash]) {
        if (that.downloadConnections[hash].hasOwnProperty(uploader_uid)) {
          that.rangeInfo.start = 0;
          that.rangeInfo.end = 9;
          that.rangeInfo.test = true;
          that.downloadConnections[hash][uploader_uid].send(that.rangeInfo);
          console.log("test rangeInfo sent to ", uploader_uid);
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
                that.rangeInfo.end = that.rangeInfo.start + BLOCK_IN_PART - 1;
                conn.metadata.downloadingPartIndex = that.rangeInfo.start;
                that.rangeInfo.test = false;  // real data package, not testing package
                conn.send(that.rangeInfo);
                console.log("download part ", that.rangeInfo.start, "from", conn.peer);
              }
            } else {
              unreliableUploaders.push(uploader_uid);
              conn.close(); // notify uploader
            }
          }
        }
        unreliableUploaders.forEach(function(unreliableUploader){
          console.log("closing unreliable connection: ", unreliableUploader);
          delete that.downloadConnections[hash][unreliableUploader];
        });
      }, 5000);
    }, 10000);  // for test: 15s, set to 5s when used in production
  },
  upload: function(my_uid, downloader_uid, fileInfo, try_count){
    var that = this;
    var connected = false;
    var conn;
    if (!this.peer.disconnected) {  // check peer's connection to PeerServer
      var peerConnConfig = {
          reliable: true,
          label: fileInfo.hash.toString(),  // data connection ID
          metadata: {count: 0, downloadingPartIndex: 0, complete: true}
      };
      conn = that.peer.connect(downloader_uid, peerConnConfig);
      conn.on('open', function(){
        connected = true;   // set flag = true so don't connect again
        console.log("connected to downloader: " + conn.peer);
        if (!that.uploadConnections[fileInfo.hash]) {
          that.uploadConnections[fileInfo.hash] = {};
        }
        that.uploadConnections[fileInfo.hash][downloader_uid] = conn;
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
        conn.on('close', function(){  // 只处理对方conn.close事件, 不管重连时的close
          console.log('downloader ' + conn.peer + ' has closed data connection');
          delete that.uploadConnections[fileInfo.hash][conn.peer];
        });
      });
      conn.on('error', function(err){
        console.log(err);
      });
    } else {
      throw PeerDisconnectedServerError("peer no longer connected to peerServer");
    }
    setTimeout(function(){  // try 3 times if connection failed
      if (try_count < MAX_TRY && !connected) {
        conn.close();
        that.upload(my_uid, downloader_uid, fileInfo, try_count+1);
      }
    }, 2000);
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
