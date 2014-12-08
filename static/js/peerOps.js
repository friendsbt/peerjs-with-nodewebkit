// DOM

var BLOCK_SIZE = 1024;
var BLOCK_IN_PART = 1024;
var MAX_TRY = 3;
var DOWNLOAD_OVER = 0;
var DOWNLOADING = 1;
var CANCELED = 2;
var PAUSED = 3;
var DOWNLOAD_ERR = 4;
var ALREADY_COMPLETE = 5;
var peerConfig = {host: '182.92.191.93', port: 9000, debug: 3};
var e = new EventEmitter();

var PeerWrapper = {
  rangeInfo: {start: 0, end: 0, test: true},  // these two objects will be reused
  dataPeer2Peer: {content: null, checksum: 0, index: 0},
  downloadState: {},
  initPeer: function(my_uid) {  // must be called first in main.js
    this.peer = new Peer(my_uid, peerConfig);
    var that = this;
    this.uploadConnections = {};  // 保存用于上传的conn信息
    this.downloadConnections = {}; // 保存用于下载的conn信息
    this.parts_left = {}; // 记录每个文件的下载情况, key是hash, value是剩余part的Array
    this.peer.on('error', function(err){
      console.log(err);
      if (err.type === "unavailable-id") {
        that.peer = new Peer(my_uid + Date.now(), peerConfig);
      }
    });
    this.peer.on('disconnected', function(){
      setTimeout(function(){
        that.peer.reconnect();
      }, 1000);
    });
    this.peer.on('open', function(){
      console.log("connect to server");
    });
    this.peer.on('connection', function(conn) {
      var hash = conn.label;
      if (!that.downloadConnections[hash]) {
        that.downloadConnections[hash] = {};
      }
      console.log("Got connection from uploader: " + conn.peer);  // Fire for downloader
      conn.on('open', function() {
        console.log("connected to downloader: " + conn.peer);
        that.downloadConnections[hash][conn.peer] = conn;
        conn.metadata.complete = true;
        // 下载端发送可靠性测试rangeInfo
        that.rangeInfo.start = 0;
        that.rangeInfo.end = 9;
        that.rangeInfo.test = true;
        that.downloadConnections[hash][conn.peer].send(that.rangeInfo);
        console.log("test rangeInfo sent to ", conn.peer);
        // 等待3s, 确定可靠连接, 分配初始下载任务
        setTimeout(function() {
          if (conn.metadata.count === 10) {
            console.log("reliable uploader: ", conn.peer);
            window.socket.emit("uploader", {hash: hash, uploader: conn.peer});
            if (that.parts_left[hash].length > 0) {
              conn.metadata.complete = false;   // set status
              var part_index = that.parts_left[hash].shift();
              that.rangeInfo.start = BLOCK_IN_PART * part_index;
              that.rangeInfo.end = that.rangeInfo.start + BLOCK_IN_PART - 1;
              conn.metadata.downloadingPartIndex = part_index;
              that.rangeInfo.test = false;  // real data package, not testing package
              conn.send(that.rangeInfo);
              console.log("download part", part_index, "from", conn.peer);
            }
          } else {
            conn.close(); // notify uploader
          }
        }, 3000);
        conn.on('data', function(dataPeer2Peer) {
          if (dataPeer2Peer.test) {
            console.log("got test package from ", conn.peer);
            conn.metadata.count++;
          } else {
            if (dataPeer2Peer.rangeLastBlock) { // ready for downloading next part
              conn.metadata.complete = true;
              console.log("part complete: ", conn.metadata.downloadingPartIndex);
              window.socket.emit("part-complete", hash);
              e.emitEvent('part-complete-' + hash, [conn.peer]);
            }
            window.socket.emit('receive', {
              hash: hash,
              content: dataPeer2Peer.content,
              index: dataPeer2Peer.index,
              checksum: dataPeer2Peer.checksum
            });
          }
        });
        conn.on('error', function(err) {
          console.log(err);
        });
        // downloader's handler of dataConn's close event
        conn.on('close', function() {
          console.log('Connection to ' + conn.peer + ' has been closed.');
          if (!conn.metadata.complete) {  // 如果断掉的conn处于下载状态, 它正在下的part要重新下
            that.parts_left[hash].unshift(conn.metadata.downloadingPartIndex);
            console.log("readding part ", conn.metadata.downloadingPartIndex, "to parts_left");
          }
          delete that.downloadConnections[hash][conn.peer];
        });
      });
    });
  },
  downloadBlock: function(redownloadMessage){
    // 这个方法只在块重传时使用
    console.log("redownload block: ", redownloadMessage.index);
    for (var arbitraryUploader in this.uploadConnections[redownloadMessage.hash])
      break;
    this.rangeInfo.start = redownloadMessage.index;
    this.rangeInfo.end = redownloadMessage.index;
    this.rangeInfo.test = false;
    this.uploadConnections[redownloadMessage.hash][arbitraryUploader].send(this.rangeInfo);
    console.log("redownload block: ", redownloadMessage.index, "from ", arbitraryUploader);
  },
  download: function(hash, totalparts) {
    var that = this;
    var conn;
    this.parts_left[hash] = [];
    for (var i = 0; i < totalparts; i++) {
      this.parts_left[hash].push(i);
    }
    this.downloadState[hash] = DOWNLOADING;
    e.addListener('part-complete-' + hash, function(uploader){
      if (that.downloadState[hash] === DOWNLOADING && that.parts_left[hash].length > 0){
        conn = that.downloadConnections[hash][uploader];
        var part_index = that.parts_left[hash].shift();
        conn.metadata.complete = false;
        that.rangeInfo.start = BLOCK_IN_PART * part_index;
        that.rangeInfo.end = that.rangeInfo.start + BLOCK_IN_PART - 1;
        conn.metadata.downloadingPartIndex = part_index;
        that.rangeInfo.test = false;
        conn.send(that.rangeInfo);
        console.log("download part ", part_index, "from", conn.peer);
      } else if (that.parts_left[hash].length === 0) {
        console.log("part-complete listener removed");
        return true;  // remove listener
      }
    });
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
            if (rangeInfo.start === rangeInfo.end) {
              console.log("got redownload rangeInfo");
            }
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
        // uploader's handler of dataConn's close event
        conn.on('close', function(){
          console.log('Connection to ' + conn.peer + ' has been closed.');
          delete that.uploadConnections[fileInfo.hash][conn.peer];
          // MUSTN'T delete uploadConnections[hash], cause maybe uploading to others
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
    this.dataPeer2Peer.checksum = CRC32.buf(new Uint8Array(dataNode2DOM.content));
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
      console.log("buffersize: ",
        PeerWrapper.uploadConnections[dataNode2DOM.hash][dataNode2DOM.downloader].bufferSize);
    } else if (this.dataPeer2Peer.rangeLastBlock) {
      delete this.dataPeer2Peer.rangeLastBlock;
    }
    PeerWrapper.uploadConnections[dataNode2DOM.hash][dataNode2DOM.downloader]
      .send(this.dataPeer2Peer);
  },
  setDownloadState: function(hash, state) {  // downloader call this
    if (this.downloadState[hash]) {
      switch (state) {
        case DOWNLOADING:
          if (this.downloadState[hash] === PAUSED) {
            this.downloadState[hash] = DOWNLOADING;
            var conn;
            for (var uid in this.downloadConnections[hash]) {
              if (this.downloadConnections[hash].hasOwnProperty(uid)){
                conn = this.downloadConnections[hash][uid];
                if (conn.metadata.complete) {
                  e.emitEvent('part-complete-' + hash, [uid]);
                }
              }
            }
          }
          break;
        case PAUSED:
          if (this.downloadState[hash] === DOWNLOADING) {
            this.downloadState[hash] = PAUSED;
          }
          break;
        case CANCELED:
          if (this.downloadState[hash] === DOWNLOADING || this.downloadState[hash] === PAUSED) {
            this.downloadState[hash] = CANCELED;
            this.clear(hash);
          }
          break;
      }
    } else {
      console.log(hash, 'does not exist in downloadState');
    }
  },
  clear: function(hash) { // clear resources after file download complete, downloader call this
    console.assert(this.parts_left[hash].length, 0);
    for (var uid in this.downloadConnections[hash]) {
      if (this.downloadConnections[hash].hasOwnProperty(uid)){
        this.downloadConnections[hash][uid].close();
        delete this.downloadConnections[hash][uid];
      }
    }
    delete this.downloadConnections[hash];
    delete this.downloadState[hash];
    delete this.parts_left[hash];
  }
};

// TODO: 现在关闭进程时有可能 peer-server 检测不到下线
