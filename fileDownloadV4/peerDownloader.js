var fs = require('fs');
var path = require('path');
var crc32 = require('crc-32');
var settings = require('./settings');
var res_api = require('../res/res_api');

var browserWindow;
exports.initWindow = function(window) {
  browserWindow = window;
};

var BLOCK_SIZE = settings.BLOCK_SIZE;
var downloaders = global.downloaders;

global.socket.on('receive', function(dataDOM2Node){
  var hash = dataDOM2Node.hash;
  /*
  if (crc32.buf(dataDOM2Node.content) !== dataDOM2Node.checksum) {
    browserWindow.console.log(dataDOM2Node.index, "not equal");
    global.socket.emit("downloadBlock", {index: dataDOM2Node.index, hash: hash});
    return;
  }
  */
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

global.socket.on("part-complete", function(partInfo){
  var hash = partInfo.hash;
  downloaders[hash].complete_parts++;
  res_api.remove_part_from_parts_left(hash, partInfo.index);
  if (downloaders[hash].complete_parts === downloaders[hash].total_parts) {
    browserWindow.console.log("receive complete, ", Date());
    setTimeout(function(){  // 最后一个block可能还没有写入, 必须延迟一点关闭文件
      downloaders[hash].downloadOver();
    }, 1000);
  }
  var download_Bs = downloaders[hash].complete_parts * settings.partsize;
  var progress = downloaders[hash].complete_parts / downloaders[hash].total_parts;
  var downloadSpeed = downloaders[hash].lastDownloadState.calcSpeed(Date.now()/1000);
  browserWindow.console.log("download_Bs:", download_Bs);
  browserWindow.console.log("progress:", progress);
  browserWindow.console.log("speed:(Bytes/s)", downloadSpeed);
  //downloaders[hash].downloadProgressCallback(download_Bs, progress, downloadSpeed);
});

global.socket.on("uploader", function(info) { // 记录某个资源的上传者
  browserWindow.console.log("record uploader:", info.uploader);
  res_api.record_uploader(info.hash, info.uploader);
});

global.socket.on("forward", function(hash){  // 切换转发模式
  downloaders[hash].useForward();
});

var peerjsDownloader = function(fileInfo) {
  this.hash = fileInfo.hash;
  this.size = fileInfo.size;
  this.file_to_save = fileInfo.file_to_save;
};

peerjsDownloader.prototype.startFileDownload = function(parts_left){
  global.socket.emit('download', {
    hash: this.hash,
    parts_left: parts_left
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