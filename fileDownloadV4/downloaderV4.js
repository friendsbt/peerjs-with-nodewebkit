var fs = require('fs');
var paths = require('path');
var raf = require('random-access-file');
var xxhash = require('xxhashjs');
var res_api = require('../res/res_api');

var downloaders = {};  // node 环境中保存所有downloader
global.downloaders = downloaders;

var forwardDownloader = require('./forwardDownloader');
var peerjsDownloader = require('./peerDownloader').peerjsDownloader;
var settings = require('./settings');

var DOWNLOAD_OVER = settings.DownloadState['DOWNLOAD_OVER'],
    DOWNLOADING = settings.DownloadState['DOWNLOADING'],
    CANCELED = settings.DownloadState['CANCELED'],
    PAUSED = settings.DownloadState['PAUSED'],
    DOWNLOAD_ERR = settings.DownloadState['DOWNLOAD_ERR'],
    ALREADY_COMPLETE = settings.DownloadState['ALREADY_COMPLETE'];

var browserWindow;
exports.initWindow = function(window) {
  browserWindow = window;
};

function v4Downloader(fileInfo, my_uid, uploader_uids, e,
        downloadOverCallback, downloadProgressCallback) {
  this.my_uid = my_uid;
  this.innerDownloader = new peerjsDownloader(fileInfo);
  this.hash = fileInfo.hash;
  this.size = fileInfo.size;
  this.file_to_save = fileInfo.file_to_save;
  this.fileInfo = fileInfo;
  this.file_to_save_tmp = fileInfo.file_to_save + '.tmp';
  this.uploaderUidList = uploader_uids.split(',');
  this.descriptor = raf(this.file_to_save_tmp);
  this.complete_parts = 0;
  this.total_parts = parseInt((fileInfo.size+settings.partsize-1)/settings.partsize);
  this.e = e;
  this.downloadOverCallback = downloadOverCallback;
  this.downloadProgressCallback = downloadProgressCallback;
  this.status = DOWNLOADING;
  this.lastDownloadState = {
    lastTime: Date.now() / 1000,
    calcSpeed: function (nowTime) {
      var speed = settings.partsize / (nowTime - this.lastTime);
      this.lastTime = nowTime;
      return speed;
    }
  };
}

v4Downloader.prototype.startFileDownload = function(parts_left) {
  this.innerDownloader.startFileDownload(parts_left);
  var file_watch = this.file_to_save_tmp;
  var that = this;
  var intervalObj = setInterval(function(){
    // since we can't watch a non-existent file, watch has to be called after file creation
    if (fs.existsSync(file_watch)) {
      watchFile();
      clearInterval(intervalObj);
    }
  }, 1000);
  function watchFile() {
    that.watcher = fs.watch(file_watch, function (event) {
      if (event === 'rename') {
        if (!fs.existsSync(file_watch)) {
          // tmp文件消失, 且真文件又不存在, 说明在下载过程中tmp被删除或者重命名, 直接取消下载, 并向上层报错
          browserWindow.console.log("file removed or renamed during downloading.");
          if (!fs.existsSync(that.file_to_save)) {
            that.cancelFileDownload();
            that.watcher.close();
            // TODO: call downloadOverCallback with err
          }
        }
      }
    });
  }
};

v4Downloader.prototype.pauseFileDownload = function() {
  this.status = PAUSED;
  this.innerDownloader.pauseFileDownload();
};

v4Downloader.prototype.resumeFileDownload = function() {
  this.status = DOWNLOADING;
  this.innerDownloader.resumeFileDownload();
};

v4Downloader.prototype.cancelFileDownload = function() {
  if (this.status === DOWNLOADING || this.status === PAUSED) {
    this.status = CANCELED;
    this.innerDownloader.cancelFileDownload();
    if (fs.existsSync(this.file_to_save_tmp)) {
      fs.unlinkSync(this.file_to_save_tmp);
    }
    res_api.remove_record_from_parts_left(this.hash);
    this.descriptor.close();
    this.innerDownloader = null;
    if (this.watcher) {
      this.watcher.close();
    }
  }
};

v4Downloader.prototype.useForward = function() {
  // can't use Peerjs so use forward mode
  // TODO: safe delete this.innerDownloader, simple delete may leak memory
  delete this.innerDownloader;
  this.innerDownloader = new forwardDownloader(
    this.fileInfo,
    this.my_uid,
    this.uploaderUidList,
    this.e,
    this.downloadOverCallback,
    this.downloadProgressCallback
  );
  var d = this;
  res_api.get_parts_left(d.hash, function(parts_left){
    /*
    因为之前在downloadFile里面已经判断过了, 所以数据库里parts_left肯定有东西, 并且肯定需要下载
     */
    d.startFileDownload(parts_left);
  });
};

v4Downloader.prototype.downloadOver = function(){
  this.descriptor.close();
  if (parseInt(xxhash(0).update(fs.readFileSync(this.file_to_save_tmp)
  ).digest()) === global.hash) {
    var timePassed = process.hrtime(global.startTime);  // for test
    browserWindow.console.log("time passed: ", timePassed[0], " seconds");
    browserWindow.console.log("hash equal");
    browserWindow.console.log("download complete: ", paths.basename(this.file_to_save));
    global.socket.emit("complete", this.hash);
    this.watcher.close();  // fs.FSWatcher.close()
    fs.rename(
      this.file_to_save_tmp,
      this.file_to_save,
      function(err) {
        browserWindow.console.log(err);
      }
    );
  } else {
    browserWindow.console.log("hash not equal");
  }
  this.innerDownloader = null;
  delete downloaders[this.hash];
//      that.downloadOverCallback(that);
};

exports.downloadFile = function(fileInfo, my_uid, uploader_uids,
                                e, downloadOverCallback, downloadProgressCallback) {
  var d = new v4Downloader(
    fileInfo,   // {size, hash, file_to_save}
    my_uid,
    uploader_uids,
    e,
    downloadOverCallback,
    downloadProgressCallback
  );
  global.startTime = process.hrtime();  // for test
  downloaders[fileInfo.hash] = d;
  res_api.get_parts_left(d.hash, function(parts_left){
    if (parts_left) {  // parts_left表中有对应项
      // 检测文件是否已存在,如果已存在,并且没有剩余part,认为下载已完成
      if (fs.existsSync(d.file_to_save) || fs.existsSync(d.file_to_save_tmp)){
        if (parts_left.length === 0) {
          browserWindow.console.log("already complete");
          d.complete_parts = d.total_parts;
          // TODO: call downloadOverCallback
          global.socket.emit('setState', {
            hash: hash,
            state: ALREADY_COMPLETE
          });
        } else { //文件已存在,且没有下载完成,进入【断点续传】模式
          browserWindow.console.log("resume unfinished downloading");
          browserWindow.console.log("parts_left: ", parts_left);
          d.complete_parts = d.total_parts - parts_left.length;
          d.startFileDownload(parts_left);
        }
      } else {// 如果文件实际上不存在,则认为是一个全新下载,并更新parts_left表对应项
        browserWindow.console.log("file does not exist, redownload file");
        parts_left.length = 0;  // better way to make parts_left = []
        for (var i = 0; i < d.total_parts; i++) {
          parts_left.push(i);
        }
        res_api.update_parts_left(hash, parts_left);
        d.startFileDownload(parts_left);
      }
    } else { // 之前没有下载过这个文件
      browserWindow.console.log("new download");
      parts_left = [];
      for (i = 0; i < d.total_parts; i++) {
        parts_left.push(i); // 全新的下载, parts_left为所有的parts
      }
      res_api.update_parts_left(hash, parts_left);
      d.startFileDownload(parts_left);
    }
  });
};

exports.pauseFileDownload = function(hash) {
  downloaders[hash].pauseFileDownload();
};

exports.resumeFileDownload = function(hash) {
  downloaders[hash].resumeFileDownload();
};

exports.cancelFileDownload = function(hash) {
  downloaders[hash].cancelFileDownload();
  delete downloaders[hash];
};
