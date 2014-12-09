var fs = require('fs');
var path = require('path');
var xxhash = require('xxhashjs');
var crc32 = require('crc-32');
var settings = require('./settings');

var browserWindow;
exports.initWindow = function(window) {
  browserWindow = window;
};

var downloaders = global.downloaders;

global.socket.on('receive', function(dataDOM2Node){
  var hash = dataDOM2Node.hash;
  if (crc32.buf(dataDOM2Node.content) !== dataDOM2Node.checksum) {
    browserWindow.console.log(dataDOM2Node.index, "not equal");
    global.socket.emit("downloadBlock", {index: dataDOM2Node.index, hash: hash});
    return;
  }
  downloaders[hash].descriptor.write(
      dataDOM2Node.index * BLOCK_SIZE,
    dataDOM2Node.content,
    function(err) {
      if (err) {
        browserWindow.console.log(err);
      }
    }
  );
});

global.socket.on("part-complete", function(hash){
  // TODO: 到底是在v4Downloader内部记录进度还是在全局的downloaders[hash]中记录?
  // 可能张洋那边是需要在内部记录的. 如果是这样, 要把blocks_left 和 complete_parts_count 挪进v4Downloader
  downloaders[hash].complete_parts++;
  if (downloaders[hash].complete_parts === downloaders[hash].total_parts) {
    browserWindow.console.log("receive complete, ", Date());
    setTimeout(function(){  // 最后一个block可能还没有写入, 必须延迟一点关闭文件
      downloaders[hash].descriptor.close();
      if (parseInt(xxhash(0).update(fs.readFileSync(downloaders[hash].file_to_save_tmp)
        ).digest()) === 213160533) {
        browserWindow.console.log("hash equal");
        browserWindow.console.log("download complete: ", path.basename(downloaders[hash].path));
        global.socket.emit("complete", hash);
        fs.rename(
          downloaders[hash].file_to_save_tmp,
          downloaders[hash].file_to_save,
          function(err) {
            browserWindow.console.log(err);
          }
        );
      } else {
        browserWindow.console.log("hash not equal");
      }
    }, 1000);
  }
});

global.socket.on("uploader", function(info) { // 记录某个资源的上传者
  if (!downloaders[info.hash].uploaders) {
    downloaders[info.hash].uploaders = [];
  }
  // TODO: update DB
  downloaders[info.hash].uploaders.push(info.uploader);
});

var peerjsDownloader = function(fileInfo) {
  this.hash = fileInfo.hash;
  this.size = fileInfo.size;
  this.file_to_save = fileInfo.file_to_save;
};

peerjsDownloader.prototype.startFileDownload = function(){
  var totalparts = parseInt((this.size + settings.partsize-1) / settings.partsize);
  global.socket.emit('download', {
    hash: this.hash,
    totalparts: totalparts
  });
};

peerjsDownloader.prototype.pauseFileDownload = function(){
  global.socket.emit('setState', {
    hash: this.hash,
    state: settings.DownloadState.PAUSED
  });
};

peerjsDownloader.prototype.resumeFileDownload = function(){
  global.socket.emit('setState', {
    hash: this.hash,
    state: settings.DownloadState.DOWNLOADING
  });
};

peerjsDownloader.prototype.cancelFileDownload = function(){
  global.socket.emit('setState', {
    hash: this.hash,
    state: settings.DownloadState.CANCELED
  });
};

exports.peerjsDownloader = peerjsDownloader;