var fs = require('fs');
var path = require('path');
var raf = require('random-access-file');
var xxhash = require('xxhashjs');
var crc32 = require('crc-32');
var forwardDownloader = require('./forward').forwardDownloader;
var peerjsDownloader = require('./peerDownloader').peerjsDownloader;
var settings = require('./settings');

var DOWNLOAD_OVER = settings.DownloadState['DOWNLOAD_OVER'],
    DOWNLOADING = settings.DownloadState['DOWNLOADING'],
    CANCELED = settings.DownloadState['CANCELED'],
    PAUSED = settings.DownloadState['PAUSED'],
    DOWNLOAD_ERR = settings.DownloadState['DOWNLOAD_ERR'],
    ALREADY_COMPLETE = settings.DownloadState['ALREADY_COMPLETE'];

var BLOCK_SIZE = settings.BLOCK_SIZE;

var browserWindow;
exports.initWindow = function(window) {
  browserWindow = window;
};

var downloaders = {};  // node 环境中保存所有downloader

var f1 = fs.openSync(path.join(path.dirname(__dirname), 'Advice_std.mp3'), 'r');
var bf1 = Buffer(1024);

global.socket.on('receive', function(dataDOM2Node){
  if (crc32.buf(dataDOM2Node.content) !== dataDOM2Node.checksum) {
    global.socket.emit("downloadBlock", {index: dataDOM2Node.index, hash: dataDOM2Node.hash});
    return;
  }
  downloaders[dataDOM2Node.hash]['blocks_left']--;
  downloaders[dataDOM2Node.hash]['descriptor'].write(
    dataDOM2Node.index * BLOCK_SIZE,
    dataDOM2Node.content,
    function(err) {
      if (err) {
        browserWindow.console.log(err);
      }
      if (downloaders[dataDOM2Node.hash]['blocks_left'] === 0) {
        browserWindow.console.log("receive complete, ", Date());
        downloaders[dataDOM2Node.hash]['descriptor'].close();
        var hash = parseInt(xxhash(0).update(fs.readFileSync('Advice.mp3')).digest());
        if (hash === 473225162) {
          browserWindow.console.log("hash equal");
        } else {
          browserWindow.console.log("hash not equal");
        }
      }
    }
  );
});

global.socket.on("part-complete", function(hash){
  // TODO: 到底是在v4Downloader内部记录进度还是在全局的downloaders[hash]中记录?
  // 可能张洋那边是需要在内部记录的. 如果是这样, 要把blocks_left 和 complete_parts_count 挪进v4Downloader
  downloaders[hash]['complete_parts_count']++;
});

function v4Downloader(fileInfo, my_uid, uploader_uids, e,
        downloadOverCallback, downloadProgressCallback) {
  this.innerDownloader = new peerjsDownloader(fileInfo);
  this.fileInfo = fileInfo;
  this.my_uid = my_uid;
  this.uploaderUidList = uploader_uids.split(',');
  this.e = e;
  this.downloadOverCallback = downloadOverCallback;
  this.downloadProgressCallback = downloadProgressCallback;
  this.states = {
    status: DOWNLOADING,
    progress: 0,
    error: null
  };
}

v4Downloader.prototype.startFileDownload = function() {
  // update v4Downloader's state in innerDownloader
  this.innerDownloader.startFileDownload();
};

v4Downloader.prototype.pauseFileDownload = function() {
  this.states.status = PAUSED;
  this.innerDownloader.pauseFileDownload(this.states);
};

v4Downloader.prototype.resumeFileDownload = function() {
  this.states.status = DOWNLOADING;
  this.innerDownloader.resumeFileDownload(this.states);
};

v4Downloader.prototype.cancelFileDownload = function() {
  this.states.status = CANCELED;
  this.innerDownloader.cancelFileDownload(this.states);
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
  this.innerDownloader.startFileDownload();
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
  downloaders[fileInfo.hash] = {};
  downloaders[fileInfo.hash]['v4Downloader'] = d;
  downloaders[fileInfo.hash]['path'] = fileInfo.file_to_save;
  downloaders[fileInfo.hash]['descriptor'] = raf(fileInfo.file_to_save);
  downloaders[fileInfo.hash]['blocks_left'] =
    parseInt((fileInfo.size + BLOCK_SIZE - 1) / BLOCK_SIZE);
  downloaders[fileInfo.hash]['complete_parts_count'] = 0;
  d.startFileDownload();
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
